import { Injectable, Logger } from '@nestjs/common';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { templatePreviewEligibility } from './asset-job-policy';
import { AssetJobRequester } from './asset-job-requester';
import { AssetJobStore } from './asset-job-store';
import { AssetJobError, AssetJobQueueFullError } from './asset-jobs.errors';
import { templatePreviewRequest } from './template-preview-request';
import { isTemplatePreviewPresent } from './template-preview-files';

/** Outcome of one enqueue, for the caller's own log or report; never an error. */
export type TemplatePreviewEnqueueOutcome = 'requested' | 'kept' | 'not-eligible' | 'queue-full' | 'failed';

/**
 * Template preview (2026-11-25): after a template version is registered, the api asks the watcher
 * to render its preview clip. A failed enqueue never fails the save; the backfill asks again. The
 * log names the ref and an error code only.
 */
@Injectable()
export class TemplatePreviewEnqueuer {
  private readonly logger = new Logger(TemplatePreviewEnqueuer.name);

  constructor(
    private readonly requester: AssetJobRequester,
    private readonly store: AssetJobStore,
  ) {}

  async enqueueIfEligible(version: AssetVersion): Promise<TemplatePreviewEnqueueOutcome> {
    if (templatePreviewEligibility(version) !== 'ok') return 'not-eligible';
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    const location = this.store.location('template-preview', ref);
    try {
      const request = templatePreviewRequest(ref, (current) => isTemplatePreviewPresent(location, current));
      let kept = false;
      await this.requester.request({
        ...request,
        decide: async (current) => {
          const decision = await request.decide(current);
          kept = decision === 'keep';
          return decision;
        },
      });
      return kept ? 'kept' : 'requested';
    } catch (error) {
      if (error instanceof AssetJobQueueFullError) return 'queue-full';
      const errorCode = error instanceof AssetJobError ? error.reason : error instanceof Error ? error.name : 'unknown';
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'template-preview', ref, errorCode });
      return 'failed';
    }
  }
}
