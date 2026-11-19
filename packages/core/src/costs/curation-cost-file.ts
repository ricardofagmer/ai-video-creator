import { isDeepStrictEqual } from 'node:util';
import {
  CURATION_FORMAT_VERSION,
  sumCurationSessionUsd,
  type CurationCostFile,
  type CurationCostSession,
  type CurationId,
} from '@studio/shared/curation';
import { CostFileCurationMismatchError, CostSessionConflictError, PriceTableVersionMismatchError } from './costs.errors';
import { curationCostSessionKey } from './curation-cost.mapper';

export interface AppendCurationCostSessionInput {
  /** `curations/<id>/cost.json` as read through the shared helper; null before the first billed call. */
  existing: CurationCostFile | null;
  curationId: CurationId;
  priceTableVersion: string;
  session: CurationCostSession;
  now: Date;
}

export type AppendCurationCostSessionResult =
  | { outcome: 'appended'; file: CurationCostFile }
  /** The identical session was already in the file: recording is idempotent. */
  | { outcome: 'already-recorded'; file: CurationCostFile };

/**
 * Pure: the next curation cost.json content (SPEC 0005 section 5.8). `totalUsd` is recomputed as
 * the sum of every session on each append, never accumulated by hand; the shared schema re-checks
 * it on write. Mirrors `appendCostSession` for run folders.
 */
export function appendCurationCostSession(input: AppendCurationCostSessionInput): AppendCurationCostSessionResult {
  const { existing, curationId, priceTableVersion, session } = input;
  if (existing !== null && existing.curationId !== curationId) throw new CostFileCurationMismatchError(curationId, existing.curationId);
  if (existing !== null && existing.priceTableVersion !== priceTableVersion) {
    throw new PriceTableVersionMismatchError(curationId, existing.priceTableVersion, priceTableVersion);
  }

  const previous = existing?.sessions ?? [];
  const key = curationCostSessionKey(session);
  const sameKey = previous.find((recorded) => recorded.sessionId === key.sessionId && recorded.callIndex === key.callIndex);
  if (sameKey !== undefined && existing !== null) {
    if (isDeepStrictEqual(sameKey, session)) return { outcome: 'already-recorded', file: existing };
    throw new CostSessionConflictError(curationId, key.sessionId, key.callIndex);
  }

  const sessions = [...previous, session];
  return {
    outcome: 'appended',
    file: {
      format: CURATION_FORMAT_VERSION,
      curationId,
      currency: 'USD',
      priceTableVersion,
      updatedAt: input.now.toISOString(),
      sessions,
      totalUsd: sumCurationSessionUsd(sessions),
    },
  };
}
