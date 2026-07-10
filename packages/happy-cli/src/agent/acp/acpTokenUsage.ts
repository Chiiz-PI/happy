/**
 * ACP token usage extraction.
 *
 * Normalizes per-turn token usage reported by ACP agents into the
 * Claude-style usage shape Happy already uses for telemetry. The standard
 * (unstable) `PromptResponse.usage` field is preferred; provider `_meta`
 * token fields (e.g. Grok Build's flat totalTokens/inputTokens/...) are the
 * fallback.
 *
 * Agents report `inputTokens` inclusive of cached tokens, so the cached
 * share is subtracted to get the uncached input count — this keeps
 * downstream sums (input + cache_read + cache_creation) equal to the real
 * prompt size.
 */

export type AcpTokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  model: string | null;
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalize(raw: {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedReadTokens: number | null;
  cachedWriteTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  model: string | null;
}): AcpTokenUsage | null {
  if (raw.inputTokens === null && raw.outputTokens === null && raw.totalTokens === null) {
    return null;
  }

  const cacheRead = raw.cachedReadTokens ?? 0;
  const grossInput = raw.inputTokens ?? 0;

  return {
    input_tokens: Math.max(0, grossInput - cacheRead),
    output_tokens: raw.outputTokens ?? 0,
    cache_creation_input_tokens: raw.cachedWriteTokens ?? 0,
    cache_read_input_tokens: cacheRead,
    total_tokens: raw.totalTokens,
    reasoning_tokens: raw.reasoningTokens,
    model: raw.model,
  };
}

/**
 * Extract token usage from an ACP PromptResponse-shaped object.
 * Returns null when the response carries no usable token data.
 */
export function extractAcpTokenUsage(response: unknown): AcpTokenUsage | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const asRecord = response as Record<string, unknown>;

  // Standard (unstable) ACP usage field.
  const usage = asRecord.usage;
  if (usage && typeof usage === 'object') {
    const u = usage as Record<string, unknown>;
    const normalized = normalize({
      inputTokens: asNumber(u.inputTokens),
      outputTokens: asNumber(u.outputTokens),
      cachedReadTokens: asNumber(u.cachedReadTokens),
      cachedWriteTokens: asNumber(u.cachedWriteTokens),
      totalTokens: asNumber(u.totalTokens),
      reasoningTokens: asNumber(u.thoughtTokens),
      model: null,
    });
    if (normalized) {
      const meta = asRecord._meta;
      if (meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).modelId === 'string') {
        normalized.model = (meta as Record<string, unknown>).modelId as string;
      }
      return normalized;
    }
  }

  // Provider _meta fallback (Grok Build style flat token fields).
  const meta = asRecord._meta;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    return normalize({
      inputTokens: asNumber(m.inputTokens),
      outputTokens: asNumber(m.outputTokens),
      cachedReadTokens: asNumber(m.cachedReadTokens),
      cachedWriteTokens: asNumber(m.cachedWriteTokens),
      totalTokens: asNumber(m.totalTokens),
      reasoningTokens: asNumber(m.reasoningTokens),
      model: typeof m.modelId === 'string' ? m.modelId : null,
    });
  }

  return null;
}
