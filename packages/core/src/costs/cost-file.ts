import { isDeepStrictEqual } from 'node:util';
import { sumSessionUsd, type CostFile, type CostSession, type RunId } from '@studio/shared/run-format';
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

export type AppendCostSessionResult =
  | { outcome: 'appended'; file: CostFile }
  /** The identical session was already in the file: recording is idempotent (crash resume). */
  | { outcome: 'already-recorded'; file: CostFile };

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

  const previous = existing?.sessions ?? [];
  const key = costSessionKey(session);
  const sameKey = previous.find((recorded) => {
    const recordedKey = costSessionKey(recorded);
    return recordedKey.sessionId === key.sessionId && recordedKey.callIndex === key.callIndex;
  });
  if (sameKey !== undefined && existing !== null) {
    if (isDeepStrictEqual(sameKey, session)) return { outcome: 'already-recorded', file: existing };
    throw new CostSessionConflictError(runId, key.sessionId, key.callIndex);
  }

  const sessions = [...previous, session];
  return {
    outcome: 'appended',
    file: {
      format: 1,
      runId,
      currency: 'USD',
      priceTableVersion,
      updatedAt: input.now.toISOString(),
      sessions,
      totalUsd: sumSessionUsd(sessions),
    },
  };
}
