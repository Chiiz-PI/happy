/**
 * Machine-scoped RPC handlers served by the daemon connection. These back
 * the app's "new session" experience:
 *
 *   - `machine-list-directory`: read-only folder browsing confined to the
 *     user's home directory, so the app can offer a directory picker
 *     instead of a free-text path field. Deliberately narrower than the
 *     session-scoped file RPCs — no reads or writes, listing only.
 *   - `claude-list-local-sessions` / `codex-list-local-sessions`: surface
 *     conversations started outside Happy (plain `claude` / `codex` runs)
 *     so the app can resume them via `spawn-happy-session` with
 *     `resumeClaudeSessionId` / `resumeCodexThreadId`.
 */

import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager';
import { logger } from '@/ui/logger';
import { listClaudeLocalSessions, listCodexLocalSessions, LocalSessionSummary } from './localSessions';

export interface MachineListDirectoryRequest {
    /** Absolute path to list; relative paths resolve against home. Defaults to home. */
    path?: string;
}

export interface MachineDirectoryEntry {
    name: string;
    type: 'file' | 'directory' | 'other';
    modified?: number; // epoch ms
    /** Present on directories: true when the folder contains a .git entry. */
    isGitRepo?: boolean;
}

export interface MachineListDirectoryResponse {
    success: boolean;
    /** Resolved absolute path that was listed. */
    path?: string;
    homeDir?: string;
    entries?: MachineDirectoryEntry[];
    error?: string;
}

export interface ListLocalSessionsResponse {
    success: boolean;
    sessions?: LocalSessionSummary[];
    error?: string;
}

export function registerMachineHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<MachineListDirectoryRequest, MachineListDirectoryResponse>('machine-list-directory', async (data) => {
        const home = homedir();
        const requested = typeof data?.path === 'string' && data.path.trim().length > 0 ? data.path.trim() : home;
        const resolved = resolve(home, requested);

        if (resolved !== home && !resolved.startsWith(home + sep)) {
            return { success: false, error: `Access denied: path '${requested}' is outside the home directory` };
        }

        try {
            const dirents = await readdir(resolved, { withFileTypes: true });
            const entries = await Promise.all(dirents.map(async (entry): Promise<MachineDirectoryEntry> => {
                const type = entry.isDirectory() ? 'directory' as const : entry.isFile() ? 'file' as const : 'other' as const;
                const result: MachineDirectoryEntry = { name: entry.name, type };
                try {
                    const stats = await stat(join(resolved, entry.name));
                    result.modified = stats.mtime.getTime();
                } catch {
                    // Broken symlink or raced deletion — keep the bare entry
                }
                if (type === 'directory') {
                    // .git can be a directory or a file (worktrees); existence is enough
                    result.isGitRepo = await stat(join(resolved, entry.name, '.git')).then(() => true).catch(() => false);
                }
                return result;
            }));

            entries.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            return { success: true, path: resolved, homeDir: home, entries };
        } catch (error) {
            logger.debug('[MACHINE HANDLERS] Failed to list directory:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to list directory' };
        }
    });

    rpcHandlerManager.registerHandler<void, ListLocalSessionsResponse>('claude-list-local-sessions', async () => {
        try {
            return { success: true, sessions: await listClaudeLocalSessions() };
        } catch (error) {
            logger.debug('[MACHINE HANDLERS] Failed to list local Claude sessions:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to list local Claude sessions' };
        }
    });

    rpcHandlerManager.registerHandler<void, ListLocalSessionsResponse>('codex-list-local-sessions', async () => {
        try {
            return { success: true, sessions: await listCodexLocalSessions() };
        } catch (error) {
            logger.debug('[MACHINE HANDLERS] Failed to list local Codex sessions:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to list local Codex sessions' };
        }
    });
}
