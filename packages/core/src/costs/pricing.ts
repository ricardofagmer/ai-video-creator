import { type UsageQuantity } from '@studio/shared/ports';
import { type PriceTable, type UnitPrice } from './price-table';
import { PriceNotAvailableError, type PriceSubject } from './costs.errors';

const TOKENS_PER_MILLION = 1_000_000;

function assertCount(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('usage quantities must be finite and non-negative');
}

function unitUsd(price: UnitPrice, units: number, subject: PriceSubject, table: PriceTable): number {
  if (price.status === 'unpriced') throw new PriceNotAvailableError(subject, table.version);
  return units * price.usdPerUnit;
}

/**
 * USD of one usage quantity with the price table (ADR 0002 "Cost"). Cache read and cache write
 * tokens are priced separately from uncached input. Throws `PriceNotAvailableError` rather than
 * pricing an unknown model or an unpriced provider as zero.
 */
export function priceUsage(table: PriceTable, usage: UsageQuantity): number {
  switch (usage.kind) {
    case 'model': {
      for (const count of [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens]) assertCount(count);
      // Own keys only: a model id such as "constructor" must not resolve through the prototype.
      const price = Object.hasOwn(table.models, usage.modelId) ? table.models[usage.modelId] : undefined;
      if (price === undefined) throw new PriceNotAvailableError({ kind: 'model', modelId: usage.modelId }, table.version);
      const tokenWeightedUsdPerMillion =
        usage.inputTokens * price.inputUsdPerMillionTokens +
        usage.outputTokens * price.outputUsdPerMillionTokens +
        usage.cacheReadTokens * price.cacheReadUsdPerMillionTokens +
        usage.cacheWriteTokens * price.cacheWriteUsdPerMillionTokens;
      return tokenWeightedUsdPerMillion / TOKENS_PER_MILLION;
    }
    case 'tts':
      assertCount(usage.characters);
      return unitUsd(table.ttsPerCharacter[usage.provider], usage.characters, { kind: 'provider', provider: usage.provider }, table);
    case 'render':
      assertCount(usage.renderSeconds);
      return unitUsd(table.renderPerSecond, usage.renderSeconds, { kind: 'provider', provider: 'render' }, table);
  }
}
