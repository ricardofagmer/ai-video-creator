import { PriceNotAvailableError } from '@studio/core/costs';
import type { CostLedgerPort, StageExecutionContext, UsageQuantity } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';

/**
 * The price of one generated track, and how to record it once the track exists. Only a priced
 * answer carries `record`, so a generation that was never priced can never be recorded.
 */
export type MusicGenerationPrice =
  | { status: 'priced'; usd: number; record: (context: StageExecutionContext, at: Date) => Promise<void> }
  | { status: 'unpriced' };

/**
 * Prices an ElevenLabs music generation before the call (R1-11 fails closed): the requested
 * length through the ledger's price table (docs/specs/2026-11-25-music-spend-kind-design.md). A
 * table that leaves music unpriced answers `unpriced`, and the stage stops for a person before any
 * egress or spend. The quantity billed is the requested length; the provider reports no usage.
 */
export function priceMusicGeneration(ledger: CostLedgerPort, lengthMs: number): MusicGenerationPrice {
  const musicSeconds = lengthMs / 1000;
  const usage: UsageQuantity = { kind: 'music', provider: 'elevenlabs', musicSeconds };
  let usd: number;
  try {
    usd = ledger.priceUsd(usage);
  } catch (error) {
    if (error instanceof PriceNotAvailableError) return { status: 'unpriced' };
    throw error;
  }
  return {
    status: 'priced',
    usd,
    record: async (context, at) => {
      await ledger.record({
        runId: context.runId,
        runDir: context.runDir,
        session: {
          kind: 'music',
          sessionId: newSessionId(),
          stepKey: context.stepKey,
          provider: 'elevenlabs',
          musicSeconds,
          usd,
          at: at.toISOString(),
        },
      });
    },
  };
}
