import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type ReferenceAnalysisJobFile } from '@studio/shared/asset-jobs';
import { referenceAnalysisEligibility } from '../asset-job-policy';
import { AssetJobRequester } from '../asset-job-requester';
import { AssetJobVersions } from '../asset-job-versions';
import { AssetJobError } from '../asset-jobs.errors';
import { referenceAnalysisRequest, referenceIneligibilityError } from '../reference-analysis-request';
import { RequestReferenceAnalysisCommand } from './request-reference-analysis.command';

@CommandHandler(RequestReferenceAnalysisCommand)
export class RequestReferenceAnalysisHandler implements ICommandHandler<RequestReferenceAnalysisCommand, ReferenceAnalysisJobFile> {
  private readonly logger = new Logger(RequestReferenceAnalysisHandler.name);

  constructor(
    private readonly versions: AssetJobVersions,
    private readonly requester: AssetJobRequester,
  ) {}

  async execute(command: RequestReferenceAnalysisCommand): Promise<ReferenceAnalysisJobFile> {
    try {
      const { ref, version } = await this.versions.find(command.target);
      const refusal = referenceIneligibilityError(ref, referenceAnalysisEligibility(version));
      if (refusal !== null) throw refusal;
      return await this.requester.request(referenceAnalysisRequest(ref));
    } catch (error) {
      if (error instanceof AssetJobError) this.logger.log({ event: 'asset-job.refused-request', kind: 'reference-analysis', reason: error.reason });
      throw error;
    }
  }
}
