import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { listClaudeLocalSessions, listCodexLocalSessions, listGrokLocalSessions } from './localSessions';

describe('localSessions', () => {
    let root: string;

    beforeEach(async () => {
        root = join(tmpdir(), `local-sessions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await mkdir(root, { recursive: true });
    });

    afterEach(async () => {
        if (existsSync(root)) {
            await rm(root, { recursive: true, force: true });
        }
    });

    function jsonl(lines: object[]): string {
        return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    }

    describe('listClaudeLocalSessions', () => {
        const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

        async function writeClaudeSession(projectDir: string, id: string, lines: object[]): Promise<void> {
            const dir = join(root, projectDir);
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, `${id}.jsonl`), jsonl(lines), 'utf-8');
        }

        it('returns directory and first user prompt', async () => {
            await writeClaudeSession('-home-user-project', sessionId, [
                { type: 'queue-operation', operation: 'enqueue', content: 'queued' },
                { type: 'user', cwd: '/home/user/project', sessionId, message: { role: 'user', content: 'fix the login bug' } },
                { type: 'assistant', cwd: '/home/user/project', message: { role: 'assistant', content: [] } },
            ]);

            const sessions = await listClaudeLocalSessions(root);
            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe(sessionId);
            expect(sessions[0].directory).toBe('/home/user/project');
            expect(sessions[0].summary).toBe('fix the login bug');
            expect(sessions[0].updatedAt).toBeGreaterThan(0);
        });

        it('skips meta prompts (slash commands, caveats) when a real prompt follows', async () => {
            await writeClaudeSession('-home-user-project', sessionId, [
                { type: 'user', cwd: '/home/user/project', message: { role: 'user', content: 'Caveat: the messages below were generated…' } },
                { type: 'user', cwd: '/home/user/project', message: { role: 'user', content: '<command-name>/clear</command-name>' } },
                { type: 'user', cwd: '/home/user/project', message: { role: 'user', content: 'real question here' } },
            ]);

            const sessions = await listClaudeLocalSessions(root);
            expect(sessions[0].summary).toBe('real question here');
        });

        it('falls back to a meta prompt when nothing else exists', async () => {
            await writeClaudeSession('-home-user-project', sessionId, [
                { type: 'user', cwd: '/home/user/project', message: { role: 'user', content: '<command-name>/init</command-name>' } },
            ]);

            const sessions = await listClaudeLocalSessions(root);
            expect(sessions).toHaveLength(1);
            expect(sessions[0].summary).toContain('command-name');
        });

        it('ignores sidechain prompts and sessions without any user prompt', async () => {
            await writeClaudeSession('-home-user-project', sessionId, [
                { type: 'user', isSidechain: true, cwd: '/home/user/project', message: { role: 'user', content: 'sidechain task' } },
                { type: 'assistant', cwd: '/home/user/project', message: { role: 'assistant', content: [] } },
            ]);

            const sessions = await listClaudeLocalSessions(root);
            expect(sessions).toHaveLength(0);
        });

        it('sorts by mtime descending and respects the limit', async () => {
            const older = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
            const newer = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
            await writeClaudeSession('-p1', older, [
                { type: 'user', cwd: '/p1', message: { role: 'user', content: 'older' } },
            ]);
            await new Promise((r) => setTimeout(r, 20));
            await writeClaudeSession('-p2', newer, [
                { type: 'user', cwd: '/p2', message: { role: 'user', content: 'newer' } },
            ]);

            const sessions = await listClaudeLocalSessions(root);
            expect(sessions.map((s) => s.id)).toEqual([newer, older]);

            const limited = await listClaudeLocalSessions(root, 1);
            expect(limited.map((s) => s.id)).toEqual([newer]);
        });

        it('returns empty list when the projects dir does not exist', async () => {
            const sessions = await listClaudeLocalSessions(join(root, 'missing'));
            expect(sessions).toEqual([]);
        });

        it('collapses multiline prompts and truncates long ones', async () => {
            await writeClaudeSession('-home-user-project', sessionId, [
                { type: 'user', cwd: '/home/user/project', message: { role: 'user', content: 'line one\nline two\n' + 'x'.repeat(500) } },
            ]);

            const sessions = await listClaudeLocalSessions(root);
            expect(sessions[0].summary).not.toContain('\n');
            expect(sessions[0].summary.length).toBeLessThanOrEqual(200);
        });
    });

    describe('listCodexLocalSessions', () => {
        const threadId = '019f4502-9e70-7733-8bfc-bb3e82d7bacb';

        async function writeRollout(day: string, id: string, lines: object[]): Promise<void> {
            const dir = join(root, ...day.split('/'));
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, `rollout-${day.replace(/\//g, '-')}T00-00-00-${id}.jsonl`), jsonl(lines), 'utf-8');
        }

        it('returns thread id, cwd and first user message', async () => {
            await writeRollout('2026/07/08', threadId, [
                { type: 'session_meta', payload: { id: threadId, cwd: '/home/user/project', timestamp: '2026-07-08T00:00:00Z' } },
                { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions' }] } },
                { type: 'event_msg', payload: { type: 'user_message', message: 'refactor the auth flow' } },
            ]);

            const sessions = await listCodexLocalSessions(root);
            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe(threadId);
            expect(sessions[0].directory).toBe('/home/user/project');
            expect(sessions[0].summary).toBe('refactor the auth flow');
        });

        it('skips rollouts without a user message', async () => {
            await writeRollout('2026/07/08', threadId, [
                { type: 'session_meta', payload: { id: threadId, cwd: '/home/user/project' } },
                { type: 'event_msg', payload: { type: 'agent_message', message: 'hello' } },
            ]);

            const sessions = await listCodexLocalSessions(root);
            expect(sessions).toHaveLength(0);
        });

        it('skips files that do not start with session_meta', async () => {
            await writeRollout('2026/07/08', threadId, [
                { type: 'event_msg', payload: { type: 'user_message', message: 'orphan' } },
            ]);

            const sessions = await listCodexLocalSessions(root);
            expect(sessions).toHaveLength(0);
        });

        it('returns empty list when the sessions dir does not exist', async () => {
            const sessions = await listCodexLocalSessions(join(root, 'missing'));
            expect(sessions).toEqual([]);
        });
    });

    describe('listGrokLocalSessions', () => {
        const grokSessionId = '019f4c83-12ac-7ad1-ab39-01b7ba337716';

        async function writeGrokSession(cwd: string, id: string, options: {
            summary?: object;
            history?: object[];
        } = {}): Promise<void> {
            const dir = join(root, encodeURIComponent(cwd), id);
            await mkdir(dir, { recursive: true });
            const summary = options.summary ?? { info: { id, cwd } };
            await writeFile(join(dir, 'summary.json'), JSON.stringify(summary), 'utf-8');
            if (options.history) {
                await writeFile(join(dir, 'chat_history.jsonl'), jsonl(options.history), 'utf-8');
            }
        }

        it('returns id, cwd and the first user_query prompt', async () => {
            await writeGrokSession('/home/user/project', grokSessionId, {
                history: [
                    { type: 'system', content: 'You are Grok…' },
                    { type: 'user', content: [{ type: 'text', text: '<user_info>\nOS Version: linux\n</user_info>' }] },
                    { type: 'user', content: [{ type: 'text', text: '<system-reminder>\nskills…\n</system-reminder>' }] },
                    { type: 'user', content: [{ type: 'text', text: '<user_query>\nfix the login bug\n</user_query>' }] },
                    { type: 'assistant', content: 'On it.' },
                ],
            });

            const sessions = await listGrokLocalSessions(root);
            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe(grokSessionId);
            expect(sessions[0].directory).toBe('/home/user/project');
            expect(sessions[0].summary).toBe('fix the login bug');
            expect(sessions[0].updatedAt).toBeGreaterThan(0);
        });

        it('falls back to the generated title when history has no user_query', async () => {
            await writeGrokSession('/home/user/project', grokSessionId, {
                summary: { info: { id: grokSessionId, cwd: '/home/user/project' }, generated_title: 'Login Bug Investigation' },
                history: [
                    { type: 'system', content: 'You are Grok…' },
                ],
            });

            const sessions = await listGrokLocalSessions(root);
            expect(sessions).toHaveLength(1);
            expect(sessions[0].summary).toBe('Login Bug Investigation');
        });

        it('skips sessions with neither a prompt nor a title, and non-session files', async () => {
            await writeGrokSession('/home/user/project', grokSessionId);
            // Stray files that live alongside session dirs in a real store
            await writeFile(join(root, 'session_search.sqlite'), '', 'utf-8');
            await writeFile(join(root, encodeURIComponent('/home/user/project'), 'prompt_history.jsonl'), '{}\n', 'utf-8');

            const sessions = await listGrokLocalSessions(root);
            expect(sessions).toHaveLength(0);
        });

        it('sorts by summary.json mtime descending and respects the limit', async () => {
            const older = '019f0000-0000-7000-8000-000000000001';
            const newer = '019f0000-0000-7000-8000-000000000002';
            const history = (text: string) => [{ type: 'user', content: [{ type: 'text', text: `<user_query>\n${text}\n</user_query>` }] }];
            await writeGrokSession('/p1', older, { history: history('older') });
            await new Promise((r) => setTimeout(r, 20));
            await writeGrokSession('/p2', newer, { history: history('newer') });

            const sessions = await listGrokLocalSessions(root);
            expect(sessions.map((s) => s.id)).toEqual([newer, older]);

            const limited = await listGrokLocalSessions(root, 1);
            expect(limited.map((s) => s.id)).toEqual([newer]);
        });

        it('returns empty list when the sessions dir does not exist', async () => {
            const sessions = await listGrokLocalSessions(join(root, 'missing'));
            expect(sessions).toEqual([]);
        });
    });
});
