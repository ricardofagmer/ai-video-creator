import {
  ASSET_JOB_COST_FORMAT_VERSION,
  ASSET_JOB_COST_SESSIONS_MAX,
  sumAssetJobSessionUsd,
  type AssetJobCostFile,
  type AssetJobCostSession,
  type AssetJobKind,
} from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { appendSessionToFile, type AppendSessionResult } from './cost-file-append';
import { AssetJobCostFileMismatchError, AssetJobCostSessionsFullError, CostSessionConflictError } from './costs.errors';

export interface AppendAssetJobCostSessionInput {
  /** `asset-jobs/<kind>/<ref>/cost.json` as read through the shared helper; null before the first billed call. */
  existing: AssetJobCostFile | null;
  kind: AssetJobKind;
  ref: AssetRef;
  priceTableVersion: string;
  session: AssetJobCostSession;
  now: Date;
}

export type AppendAssetJobCostSessionResult = AppendSessionResult<AssetJobCostFile>;

/**
 * Pure: the next asset job cost.json content (spec Amendment 3). Unlike a curation, the file
 * outlives app updates, so each session keeps the table version that priced it and a table
 * upgrade never stops recording. Past `ASSET_JOB_COST_SESSIONS_MAX` the session is refused
 * rather than dropped, so spend is never lost silently.
 */
export function appendAssetJobCostSession(input: AppendAssetJobCostSessionInput): AppendAssetJobCostSessionResult {
  const { existing, kind, ref, priceTableVersion, session } = input;
  if (existing !== null && (existing.ref !== ref || existing.kind !== kind)) {
    throw new AssetJobCostFileMismatchError(kind, ref);
  }

  return appendSessionToFile<AssetJobCostSession, AssetJobCostFile>({
    existing,
    session,
    hasSameKey: (recorded) => recorded.sessionId === session.sessionId,
    conflictError: () => new CostSessionConflictError(ref, session.sessionId, 1),
    assertAppendable: (previous) => {
      if (previous.length >= ASSET_JOB_COST_SESSIONS_MAX) throw new AssetJobCostSessionsFullError(kind, ref);
    },
    buildFile: (sessions) => ({
      format: ASSET_JOB_COST_FORMAT_VERSION,
      kind,
      ref,
      currency: 'USD',
      priceTableVersion,
      updatedAt: input.now.toISOString(),
      sessions,
      totalUsd: sumAssetJobSessionUsd(sessions),
    }),
  });
}
