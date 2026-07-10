/**
 * Minimal scripted ACP agent used by AcpBackend integration tests.
 *
 * Speaks ndJSON JSON-RPC on stdio:
 * - initialize      -> advertises loadSession capability
 * - session/load    -> replays two history events for RESUMABLE_SESSION_ID,
 *                      errors for anything else
 * - session/new     -> creates FRESH_SESSION_ID
 * - session/prompt  -> streams one message chunk, returns Grok-style _meta
 *                      token usage
 */

const RESUMABLE_SESSION_ID = 'fixture-resumable-session';
const FRESH_SESSION_ID = 'fixture-fresh-session';

let buffer = '';

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function notifySessionUpdate(sessionId, update) {
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } });
}

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    const { id, method, params } = request;

    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: 1,
          agentCapabilities: { loadSession: true, promptCapabilities: { embeddedContext: true } },
        },
      });
      continue;
    }

    if (method === 'session/load') {
      if (params.sessionId !== RESUMABLE_SESSION_ID) {
        send({ jsonrpc: '2.0', id, error: { code: -32603, message: `Unknown session: ${params.sessionId}` } });
        continue;
      }
      // Replay history before answering, like Grok does.
      notifySessionUpdate(params.sessionId, {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'replayed user message' },
      });
      notifySessionUpdate(params.sessionId, {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'replayed agent message' },
      });
      send({
        jsonrpc: '2.0',
        id,
        result: { models: { currentModelId: 'fixture-model', availableModels: [{ modelId: 'fixture-model', name: 'Fixture Model' }] } },
      });
      continue;
    }

    if (method === 'session/new') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          sessionId: FRESH_SESSION_ID,
          models: { currentModelId: 'fixture-model', availableModels: [{ modelId: 'fixture-model', name: 'Fixture Model' }] },
        },
      });
      continue;
    }

    if (method === 'session/prompt') {
      notifySessionUpdate(params.sessionId, {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'live reply' },
      });
      send({
        jsonrpc: '2.0',
        id,
        result: {
          stopReason: 'end_turn',
          _meta: {
            totalTokens: 1300,
            modelId: 'fixture-model',
            inputTokens: 1200,
            outputTokens: 100,
            cachedReadTokens: 1000,
            reasoningTokens: 5,
          },
        },
      });
      continue;
    }

    if (id !== undefined) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  }
});
