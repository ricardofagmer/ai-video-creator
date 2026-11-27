import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { AssetPurposeSync } from '../../catalog/asset-purpose.sync';
import { AssetJobRequester } from '../asset-job-requester';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { AssetJobError, AssetPurposeJobOpenError } from '../asset-jobs.errors';
import { assetPurposeRequest, isOpenAssetPurposeJob } from '../asset-purpose-request';
import { RequestAssetPurposeGenerationCommand } from './request-asset-purpose-generation.command';

/**
 * C-P4 order: refuse an open job (409), set `purposeSource: none`, then request the job. The
 * source is cleared first so a request that fails (a full queue) leaves the row waiting for the
 * backfill rather than marked as written. An unknown version is the catalog's 404.
 */
@CommandHandler(RequestAssetPurposeGenerationCommand)
export class RequestAssetPurposeGenerationHandler implements ICommandHandler<RequestAssetPurposeGenerationCommand, AssetVersion> {
  private readonly logger = new Logger(RequestAssetPurposeGenerationHandler.name);

  constructor(
    private readonly versions: AssetJobVersions,
    private readonly store: AssetJobStore,
    private readonly requester: AssetJobRequester,
    private readonly purposes: AssetPurposeSync,
  ) {}

  async execute(command: RequestAssetPurposeGenerationCommand): Promise<AssetVersion> {
    try {
      const { ref, version } = await this.versions.find(command.target);
      const current = await this.store.read('asset-purpose', ref);
      if (current.status === 'present' && isOpenAssetPurposeJob(current.job)) throw new AssetPurposeJobOpenError(ref);
      const cleared = await this.purposes.clearForGeneration(version);
      await this.requester.request(assetPurposeRequest(ref));
      return cleared;
    } catch (error) {
      if (error instanceof AssetJobError) this.logger.log({ event: 'asset-job.refused-request', kind: 'asset-purpose', reason: error.reason });
      throw error;
    }
  }
}
