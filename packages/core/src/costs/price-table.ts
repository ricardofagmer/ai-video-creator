/**
 * Versioned price table in config (ADR 0002 "Cost", maintained by hand). Bump `version` on every
 * change: `cost.json` records the version that priced its sessions.
 *
 * Claude prices: Anthropic first-party API rates as listed by the `claude-api` reference
 * ("Current Models", cached 2026-11-03; shared/models.md; shared/prompt-caching.md "Economics"),
 * read 2026-11-18. Upstream page: https://platform.claude.com/docs/en/about-claude/pricing.
 * Cache writes are priced at the 5-minute TTL rate (1.25x input); 1-hour writes cost 2x input
 * and are NOT priced here, so R1-12 must mark stable prefixes with the default 5-minute TTL.
 * `inputTokens` in a session are the uncached input tokens only (Anthropic `input_tokens`).
 */

export interface ModelPrice {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  cacheReadUsdPerMillionTokens: number;
  cacheWriteUsdPerMillionTokens: number;
  cacheWriteTtl: '5m';
}

/** How a provider's usage is priced; `unpriced` makes live estimation fail closed (named error). */
export type UnitPrice =
  | { status: 'priced'; usdPerUnit: number; basis: 'published-rate' | 'local-process'; source: string }
  | { status: 'unpriced'; reason: string };

export interface PriceTable {
  version: string;
  readAt: string;
  sources: readonly string[];
  models: Readonly<Record<string, ModelPrice>>;
  ttsPerCharacter: Readonly<Record<'elevenlabs' | 'local-voice', UnitPrice>>;
  renderPerSecond: UnitPrice;
}

export const PRICE_TABLE: PriceTable = {
  version: '2026-11-18.1',
  readAt: '2026-11-18',
  sources: [
    'claude-api skill reference, Current Models table (cached 2026-11-03), read 2026-11-18',
    'https://platform.claude.com/docs/en/about-claude/pricing',
    'PRD 0001 D7 and SPEC 0002 C11: local voice and Remotion render run on the owner Mac',
  ],
  models: {
    'claude-opus-5-5': {
      inputUsdPerMillionTokens: 4,
      outputUsdPerMillionTokens: 20,
      cacheReadUsdPerMillionTokens: 0.2,
      cacheWriteUsdPerMillionTokens: 5,
      cacheWriteTtl: '5m',
    },
    'claude-sonnet-5-5': {
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 10,
      cacheReadUsdPerMillionTokens: 0.1,
      cacheWriteUsdPerMillionTokens: 2.5,
      cacheWriteTtl: '5m',
    },
  },
  ttsPerCharacter: {
    elevenlabs: {
      status: 'unpriced',
      reason: 'ElevenLabs bills per plan and character quota; no per-character rate was sourced with confidence',
    },
    'local-voice': {
      status: 'priced',
      usdPerUnit: 0,
      basis: 'local-process',
      source: 'SPEC 0002 C11: speak_batch.py runs on the owner Mac; no provider bill',
    },
  },
  renderPerSecond: {
    status: 'priced',
    usdPerUnit: 0,
    basis: 'local-process',
    source: 'PRD 0001 D7: Remotion renders on the owner Mac in R1 (no cloud render provider)',
  },
};
