import {
  CURATION_FORMAT_VERSION,
  sumCurationSessionUsd,
  type CurationCostFile,
  type CurationCostSession,
  type CurationId,
} from '@studio/shared/curation';
import { appendSessionToFile, type AppendSessionResult } from './cost-file-append';
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

export type AppendCurationCostSessionResult = AppendSessionResult<CurationCostFile>;

/**
 * Pure: the next curation cost.json content (SPEC 0005 section 5.8). `totalUsd` is recomputed as
 * the sum of every session on each append, never accumulated by hand; the shared schema re-checks
 * it on write. Like a run's cost.json, the file holds one price table version.
 */
export function appendCurationCostSession(input: AppendCurationCostSessionInput): AppendCurationCostSessionResult {
  const { existing, curationId, priceTableVersion, session } = input;
  if (existing !== null && existing.curationId !== curationId) throw new CostFileCurationMismatchError(curationId, existing.curationId);
  if (existing !== null && existing.priceTableVersion !== priceTableVersion) {
    throw new PriceTableVersionMismatchError(curationId, existing.priceTableVersion, priceTableVersion);
  }

  const key = curationCostSessionKey(session);
  return appendSessionToFile<CurationCostSession, CurationCostFile>({
    existing,
    session,
    hasSameKey: (recorded) => recorded.sessionId === key.sessionId && recorded.callIndex === key.callIndex,
    conflictError: () => new CostSessionConflictError(curationId, key.sessionId, key.callIndex),
    buildFile: (sessions) => ({
      format: CURATION_FORMAT_VERSION,
      curationId,
      currency: 'USD',
      priceTableVersion,
      updatedAt: input.now.toISOString(),
      sessions,
      totalUsd: sumCurationSessionUsd(sessions),
    }),
  });
}
