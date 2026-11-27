import { Query } from '@nestjs/cqrs';
import { type ReferenceAnalysisJobFile } from '@studio/shared/asset-jobs';
import { type ReferenceAnalysisEligibility } from '../asset-job-policy';
import { type AssetJobLookup } from '../asset-job-store';
import { type AssetJobTarget } from '../asset-jobs.input';

/** The version's analysis job, plus why it cannot have one when it cannot (the view's `unavailable`). */
export interface ReferenceAnalysisState {
  lookup: AssetJobLookup<ReferenceAnalysisJobFile>;
  eligibility: ReferenceAnalysisEligibility;
}

/** `GET .../reference-analysis`: any catalog version (404 when unknown); never a 422. */
export class GetReferenceAnalysisQuery extends Query<ReferenceAnalysisState> {
  /** Validated by the handler. */
  constructor(readonly target: AssetJobTarget) {
    super();
  }
}
