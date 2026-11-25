import { type TemplatePreviewJobFile } from '@studio/shared/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { type AssetJobDecision, type AssetJobRequest } from './asset-job-requester';

/**
 * An open job is returned as it is. A `done` job is kept while its clip is on disk, so a backfill
 * run never renders the same version twice; a done job whose clip is gone, and a failed or
 * refused one, are asked again. A version is immutable, so its preview never goes stale.
 */
function decideTemplatePreview(
  current: TemplatePreviewJobFile,
  isClipPresent: (job: TemplatePreviewJobFile) => Promise<boolean>,
): Promise<AssetJobDecision> | AssetJobDecision {
  switch (current.status) {
    case 'requested':
    case 'running':
      return 'keep';
    case 'done':
      return isClipPresent(current).then((present) => (present ? 'keep' : 'replace'));
    case 'failed':
    case 'refused':
      return 'replace';
  }
}

function requestedTemplatePreview(ref: AssetRef, at: Date): TemplatePreviewJobFile {
  const now = at.toISOString();
  return { format: 1, ref, kind: 'template-preview', status: 'requested', requestedAt: now, updatedAt: now };
}

/** The request the save-time enqueuer and the backfill both write, so the two cannot drift. */
export function templatePreviewRequest(
  ref: AssetRef,
  isClipPresent: (job: TemplatePreviewJobFile) => Promise<boolean>,
): AssetJobRequest<'template-preview'> {
  return {
    kind: 'template-preview',
    ref,
    decide: (current) => decideTemplatePreview(current, isClipPresent),
    build: (at) => requestedTemplatePreview(ref, at),
  };
}
