import { type AssetPurposeJobFile } from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { type AssetJobDecision, type AssetJobRequest } from './asset-job-requester';

/** True while the watcher has not ended the job: a new generation must wait for it (C-P4). */
export function isOpenAssetPurposeJob(job: AssetPurposeJobFile): boolean {
  return job.status === 'requested' || job.status === 'running';
}

/**
 * ADR 0012: an open job is returned as it is, so a repeated request never queues a second call for
 * the same version; an ended one (`done`, `failed`, `refused`) is replaced by a new request.
 */
function decideAssetPurpose(current: AssetPurposeJobFile): AssetJobDecision {
  return isOpenAssetPurposeJob(current) ? 'keep' : 'replace';
}

function requestedAssetPurpose(ref: AssetRef, at: Date): AssetPurposeJobFile {
  const now = at.toISOString();
  return { format: 1, ref, kind: 'asset-purpose', status: 'requested', requestedAt: now, updatedAt: now };
}

/** The request the generation command and the save-time enqueuer both write, so the two cannot drift. */
export function assetPurposeRequest(ref: AssetRef): AssetJobRequest<'asset-purpose'> {
  return { kind: 'asset-purpose', ref, decide: decideAssetPurpose, build: (at) => requestedAssetPurpose(ref, at) };
}
