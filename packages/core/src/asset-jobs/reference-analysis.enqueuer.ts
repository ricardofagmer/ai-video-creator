import { Injectable, Logger } from '@nestjs/common';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { referenceAnalysisEligibility } from './asset-job-policy';
import { AssetJobRequester } from './asset-job-requester';
import { AssetJobError } from './asset-jobs.errors';
import { referenceAnalysisRequest } from './reference-analysis-request';

/** Outcome of the save-time enqueue, for the caller's own log or view; never an error. */
export type ReferenceAnalysisEnqueueOutcome = 'requested' | 'not-eligible' | 'failed';

/**
 * Guided-creation design section 4 "When": after `create`, `saveVersion` or `registerByReference`
 * of an eligible video reference succeeds, the api asks for its analysis. A failed enqueue never
 * fails the save: the owner can ask again from the reference's page. The log names the ref and an
 * error code only.
 */
@Injectable()
export class ReferenceAnalysisEnqueuer {
  private readonly logger = new Logger(ReferenceAnalysisEnqueuer.name);

  constructor(private readonly requester: AssetJobRequester) {}

  async enqueueIfEligible(version: AssetVersion): Promise<ReferenceAnalysisEnqueueOutcome> {
    if (referenceAnalysisEligibility(version) !== 'ok') return 'not-eligible';
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    try {
      await this.requester.request(referenceAnalysisRequest(ref));
      return 'requested';
    } catch (error) {
      const errorCode = error instanceof AssetJobError ? error.reason : error instanceof Error ? error.name : 'unknown';
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'reference-analysis', ref, errorCode });
      return 'failed';
    }
  }
}
