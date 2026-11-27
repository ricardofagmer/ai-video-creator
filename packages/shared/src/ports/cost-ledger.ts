import type { RunId } from '../common/ids';
import type { CostSession } from '../run-format/cost';
import type { ModelId } from '../run-format/vocabulary';

/** A quantity to price with the versioned price table (ADR 0002 "Cost"). */
export type UsageQuantity =
  | {
      kind: 'model';
      modelId: ModelId;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    }
  | { kind: 'tts'; provider: 'elevenlabs' | 'local-voice'; characters: number }
  | { kind: 'render'; renderSeconds: number }
  | { kind: 'music'; provider: 'elevenlabs'; musicSeconds: number };

export interface CostRecordRequest {
  runId: RunId;
  /** Absolute run folder; the ledger writes cost.json through `@studio/shared/run-files`. */
  runDir: string;
  session: CostSession;
}

export interface CostRecordResult {
  runTotalUsd: number;
  monthToDateUsd: number;
}

/**
 * Cost accounting (R1-11). The engine compares the returned totals with `limits.costPerRunUsd`
 * and `limits.costPerMonthUsd` at `preflight` and after each session (criteria 20, 28).
 */
export interface CostLedgerPort {
  readonly priceTableVersion: string;
  priceUsd(usage: UsageQuantity): number;
  /** Appends the session to cost.json (total = sum of sessions) and to the month spend. */
  record(request: CostRecordRequest): Promise<CostRecordResult>;
  /** Spend recorded in the calendar month containing `at`, local time. */
  monthToDateUsd(at: Date): Promise<number>;
}
