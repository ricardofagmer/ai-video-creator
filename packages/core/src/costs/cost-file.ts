import { sumSessionUsd, type CostFile, type CostSession, type RunId } from '@studio/shared/run-format';
import { appendSessionToFile, type AppendSessionResult } from './cost-file-append';
import { costSessionKey } from './cost-session.mapper';
import { CostFileRunMismatchError, CostSessionConflictError, PriceTableVersionMismatchError } from './costs.errors';

export interface AppendCostSessionInput {
  /** cost.json as read through the C5 helper; null when the run has no cost.json yet. */
  existing: CostFile | null;
  runId: RunId;
  priceTableVersion: string;
  session: CostSession;
  now: Date;
}

export type AppendCostSessionResult = AppendSessionResult<CostFile>;

/**
 * Pure: the next cost.json content. `totalUsd` is recomputed as the sum of every session on
 * each append, never accumulated by hand (criterion 19); the C3 schema re-checks it on write.
 */
export function appendCostSession(input: AppendCostSessionInput): AppendCostSessionResult {
  const { existing, runId, priceTableVersion, session } = input;
  if (existing !== null && existing.runId !== runId) throw new CostFileRunMismatchError(runId, existing.runId);
  if (existing !== null && existing.priceTableVersion !== priceTableVersion) {
    throw new PriceTableVersionMismatchError(runId, existing.priceTableVersion, priceTableVersion);
  }

  const key = costSessionKey(session);
  return appendSessionToFile<CostSession, CostFile>({
    existing,
    session,
    hasSameKey: (recorded) => {
      const recordedKey = costSessionKey(recorded);
      return recordedKey.sessionId === key.sessionId && recordedKey.callIndex === key.callIndex;
    },
    conflictError: () => new CostSessionConflictError(runId, key.sessionId, key.callIndex),
    buildFile: (sessions) => ({
      format: 1,
      runId,
      currency: 'USD',
      priceTableVersion,
      updatedAt: input.now.toISOString(),
      sessions,
      totalUsd: sumSessionUsd(sessions),
    }),
  });
}
