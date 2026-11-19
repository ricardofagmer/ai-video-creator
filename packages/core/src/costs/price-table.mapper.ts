import { PriceTableSummarySchema, type PriceTableSummary } from '@studio/shared/agents';
import { type ProviderName } from '@studio/shared/run-format';
import { type PriceTable } from './price-table';
import { PriceNotAvailableError } from './costs.errors';

/**
 * C7 `PriceTableSummary` for the Planner packet. Unpriced TTS providers are left out, so the
 * planner never sees an unknown price as zero; an unpriced render rate has no place in the
 * summary's required number and fails with `PriceNotAvailableError`.
 */
export function toPriceTableSummary(table: PriceTable): PriceTableSummary {
  const tts: { provider: ProviderName; usdPerCharacter: number }[] = [];
  for (const provider of ['elevenlabs', 'local-voice'] as const) {
    const price = table.ttsPerCharacter[provider];
    if (price.status === 'priced') tts.push({ provider, usdPerCharacter: price.usdPerUnit });
  }
  if (table.renderPerSecond.status === 'unpriced') {
    throw new PriceNotAvailableError({ kind: 'provider', provider: 'render' }, table.version);
  }
  return PriceTableSummarySchema.parse({
    models: Object.entries(table.models).map(([modelId, price]) => ({
      modelId,
      inputUsdPerMillionTokens: price.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: price.outputUsdPerMillionTokens,
    })),
    tts,
    renderUsdPerSecond: table.renderPerSecond.usdPerUnit,
  });
}
