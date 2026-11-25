import { Query } from '@nestjs/cqrs';
import { type TemplatePreviewJobFile } from '@studio/shared/asset-jobs';
import { type TemplatePreviewEligibility } from '../asset-job-policy';
import { type AssetJobLookup } from '../asset-job-store';
import { type AssetJobTarget } from '../asset-jobs.input';

/** The version's preview job, plus why it cannot have one when it cannot (the view's `unavailable`). */
export interface TemplatePreviewState {
  lookup: AssetJobLookup<TemplatePreviewJobFile>;
  eligibility: TemplatePreviewEligibility;
}

/** `GET .../template-preview`: any catalog version (404 when unknown); never a 422. */
export class GetTemplatePreviewQuery extends Query<TemplatePreviewState> {
  /** Validated by the handler. */
  constructor(readonly target: AssetJobTarget) {
    super();
  }
}
