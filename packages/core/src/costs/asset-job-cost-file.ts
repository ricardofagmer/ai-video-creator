import { isDeepStrictEqual } from 'node:util';
import {
  ASSET_JOB_COST_FORMAT_VERSION,
  ASSET_JOB_COST_SESSIONS_MAX,
  sumAssetJobSessionUsd,
  type AssetJobCostFile,
  type AssetJobCostSession,
  type AssetJobKind,
} from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
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

export type AppendAssetJobCostSessionResult =
  | { outcome: 'appended'; file: AssetJobCostFile }
  /** The identical session was already in the file: recording is idempotent. */
  | { outcome: 'already-recorded'; file: AssetJobCostFile };

/**
 * Pure: the next asset job cost.json content (spec Amendment 3). Mirrors
 * `appendCurationCostSession`: `totalUsd` is recomputed from every session, a repeated identical
 * session is a no-op and the same `sessionId` with other values is a conflict. Unlike a curation, the
 * file outlives app updates, so each session keeps the table version that priced it and a table
 * upgrade never stops recording. Past `ASSET_JOB_COST_SESSIONS_MAX` the session is refused
 * rather than dropped, so spend is never lost silently.
 */
export function appendAssetJobCostSession(input: AppendAssetJobCostSessionInput): AppendAssetJobCostSessionResult {
  const { existing, kind, ref, priceTableVersion, session } = input;
  if (existing !== null && (existing.ref !== ref || existing.kind !== kind)) {
    throw new AssetJobCostFileMismatchError(kind, ref);
  }

  const previous = existing?.sessions ?? [];
  const sameKey = previous.find((recorded) => recorded.sessionId === session.sessionId);
  if (sameKey !== undefined && existing !== null) {
    if (isDeepStrictEqual(sameKey, session)) return { outcome: 'already-recorded', file: existing };
    throw new CostSessionConflictError(ref, session.sessionId, 1);
  }
  if (previous.length >= ASSET_JOB_COST_SESSIONS_MAX) throw new AssetJobCostSessionsFullError(kind, ref);

  const sessions = [...previous, session];
  return {
    outcome: 'appended',
    file: {
      format: ASSET_JOB_COST_FORMAT_VERSION,
      kind,
      ref,
      currency: 'USD',
      priceTableVersion,
      updatedAt: input.now.toISOString(),
      sessions,
      totalUsd: sumAssetJobSessionUsd(sessions),
    },
  };
}
