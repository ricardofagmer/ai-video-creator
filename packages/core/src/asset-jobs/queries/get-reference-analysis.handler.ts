import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { referenceAnalysisEligibility } from '../asset-job-policy';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { GetReferenceAnalysisQuery, type ReferenceAnalysisState } from './get-reference-analysis.query';

/** Reads only. A version that cannot be analysed never has a job folder, so it reads `none`. */
@QueryHandler(GetReferenceAnalysisQuery)
export class GetReferenceAnalysisHandler implements IQueryHandler<GetReferenceAnalysisQuery, ReferenceAnalysisState> {
  constructor(
    private readonly versions: AssetJobVersions,
    private readonly store: AssetJobStore,
  ) {}

  async execute(query: GetReferenceAnalysisQuery): Promise<ReferenceAnalysisState> {
    const { ref, version } = await this.versions.find(query.target);
    const eligibility = referenceAnalysisEligibility(version);
    if (eligibility !== 'ok') return { lookup: { status: 'none' }, eligibility };
    return { lookup: await this.store.read('reference-analysis', ref), eligibility };
  }
}
