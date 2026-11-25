import { Injectable, Logger } from '@nestjs/common';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { AssetJobRequester } from './asset-job-requester';
import { AssetJobError } from './asset-jobs.errors';
import { assetPurposeRequest } from './asset-purpose-request';

/** Outcome of the save-time enqueue, for the caller's own log or view; never an error. */
export type AssetPurposeEnqueueOutcome = 'requested' | 'failed';

/**
 * ADR 0012 (AP-01): after `create`, `saveVersion` or `registerByReference` succeeds, the api asks
 * for the version's purpose. Every kind qualifies; a biometric row is written from its name, kind
 * and tags only by the watcher (AP-05). A failed enqueue never fails the save: the owner can ask
 * again from the detail page, and the backfill finds the version. The log names the ref and an
 * error code only.
 */
@Injectable()
export class AssetPurposeEnqueuer {
  private readonly logger = new Logger(AssetPurposeEnqueuer.name);

  constructor(private readonly requester: AssetJobRequester) {}

  async enqueue(version: AssetVersion): Promise<AssetPurposeEnqueueOutcome> {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    try {
      await this.requester.request(assetPurposeRequest(ref));
      return 'requested';
    } catch (error) {
      const errorCode = error instanceof AssetJobError ? error.reason : error instanceof Error ? error.name : 'unknown';
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'asset-purpose', ref, errorCode });
      return 'failed';
    }
  }
}
