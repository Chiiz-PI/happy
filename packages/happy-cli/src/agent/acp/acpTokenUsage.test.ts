import { describe, expect, it } from 'vitest';
import { extractAcpTokenUsage } from './acpTokenUsage';

describe('extractAcpTokenUsage', () => {
  it('prefers the standard ACP usage field', () => {
    const usage = extractAcpTokenUsage({
      stopReason: 'end_turn',
      usage: {
        inputTokens: 1200,
        outputTokens: 40,
        cachedReadTokens: 1000,
        cachedWriteTokens: 50,
        thoughtTokens: 12,
        totalTokens: 1240,
      },
      _meta: { modelId: 'some-model' },
    });

    expect(usage).toEqual({
      input_tokens: 200,
      output_tokens: 40,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 1000,
      total_tokens: 1240,
      reasoning_tokens: 12,
      model: 'some-model',
    });
  });

  it('falls back to Grok-style _meta token fields', () => {
    // Shape captured from a real Grok Build 0.2.93 prompt response (see
    // docs/research/grok-acp-capability-report.md).
    const usage = extractAcpTokenUsage({
      stopReason: 'end_turn',
      _meta: {
        sessionId: '019f4bb6-1b86-7640-baa7-1a87f356e578',
        totalTokens: 12752,
        modelId: 'grok-4.5',
        inputTokens: 12710,
        outputTokens: 41,
        cachedReadTokens: 12544,
        reasoningTokens: 33,
      },
    });

    expect(usage).toEqual({
      input_tokens: 166,
      output_tokens: 41,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 12544,
      total_tokens: 12752,
      reasoning_tokens: 33,
      model: 'grok-4.5',
    });
  });

  it('clamps input to zero when cached reads exceed gross input', () => {
    const usage = extractAcpTokenUsage({
      _meta: { inputTokens: 100, outputTokens: 5, cachedReadTokens: 150 },
    });

    expect(usage).toMatchObject({
      input_tokens: 0,
      output_tokens: 5,
      cache_read_input_tokens: 150,
    });
  });

  it('returns null when the response carries no token data', () => {
    expect(extractAcpTokenUsage({ stopReason: 'end_turn' })).toBeNull();
    expect(extractAcpTokenUsage({ stopReason: 'end_turn', _meta: { modelId: 'grok-4.5' } })).toBeNull();
    expect(extractAcpTokenUsage(null)).toBeNull();
    expect(extractAcpTokenUsage(undefined)).toBeNull();
  });

  it('ignores malformed token values', () => {
    const usage = extractAcpTokenUsage({
      _meta: { inputTokens: 'many', outputTokens: 7, totalTokens: NaN },
    });

    expect(usage).toMatchObject({
      input_tokens: 0,
      output_tokens: 7,
      total_tokens: null,
    });
  });
});
