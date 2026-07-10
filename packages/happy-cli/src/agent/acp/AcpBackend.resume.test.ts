import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AcpBackend } from './AcpBackend';
import type { AgentMessage } from '../core';

const FIXTURE_AGENT = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'fakeAcpAgent.mjs');
const RESUMABLE_SESSION_ID = 'fixture-resumable-session';
const FRESH_SESSION_ID = 'fixture-fresh-session';

function createBackend(resumeSessionId?: string) {
  return new AcpBackend({
    agentName: 'fixture',
    cwd: process.cwd(),
    command: process.execPath,
    args: [FIXTURE_AGENT],
    resumeSessionId,
  });
}

describe('AcpBackend session resume', () => {
  let backend: AcpBackend | null = null;

  afterEach(async () => {
    await backend?.dispose();
    backend = null;
  });

  it('resumes via session/load and suppresses replayed history', async () => {
    backend = createBackend(RESUMABLE_SESSION_ID);
    const messages: AgentMessage[] = [];
    backend.onMessage((msg) => messages.push(msg));

    const started = await backend.startSession();

    expect(started.resumed).toBe(true);
    expect(started.providerSessionId).toBe(RESUMABLE_SESSION_ID);

    // Replayed history must not be re-emitted as fresh model output.
    const outputs = messages.filter((msg) => msg.type === 'model-output');
    expect(outputs).toHaveLength(0);

    // Live prompts after the resume flow normally.
    await backend.sendPrompt(started.sessionId, 'hello');
    const liveOutputs = messages.filter((msg) => msg.type === 'model-output');
    expect(liveOutputs.length).toBeGreaterThan(0);

    // Token usage from the prompt response _meta is emitted.
    const tokenCounts = messages.filter((msg) => msg.type === 'token-count');
    expect(tokenCounts).toHaveLength(1);
    expect(tokenCounts[0]).toMatchObject({
      input_tokens: 200,
      output_tokens: 100,
      cache_read_input_tokens: 1000,
      total_tokens: 1300,
      model: 'fixture-model',
    });
  });

  it('falls back to a new session when session/load fails', async () => {
    backend = createBackend('expired-session-id');
    const started = await backend.startSession();

    expect(started.resumed).toBe(false);
    expect(started.providerSessionId).toBe(FRESH_SESSION_ID);
  });

  it('creates a new session when no resume id is given', async () => {
    backend = createBackend();
    const started = await backend.startSession();

    expect(started.resumed).toBe(false);
    expect(started.providerSessionId).toBe(FRESH_SESSION_ID);
  });
});
