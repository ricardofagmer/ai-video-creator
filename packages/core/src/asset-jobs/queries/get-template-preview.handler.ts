import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type TemplatePreviewJobFile } from '@studio/shared/asset-jobs';
import { templatePreviewEligibility } from '../asset-job-policy';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { isTemplatePreviewPresent } from '../template-preview-files';
import { GetTemplatePreviewQuery, type TemplatePreviewState } from './get-template-preview.query';

/** The job without its clip: what a done job with nothing on disk can honestly say. */
function withoutClip(job: TemplatePreviewJobFile): TemplatePreviewJobFile {
  return { ...job, clip: undefined };
}

/**
 * Reads only. A version that cannot have a preview never has a job folder, so it reads `none`. A
 * `done` job whose files are gone is returned without `clip`, so no card offers a dead clip.
 */
@QueryHandler(GetTemplatePreviewQuery)
export class GetTemplatePreviewHandler implements IQueryHandler<GetTemplatePreviewQuery, TemplatePreviewState> {
  constructor(
    private readonly versions: AssetJobVersions,
    private readonly store: AssetJobStore,
  ) {}

  async execute(query: GetTemplatePreviewQuery): Promise<TemplatePreviewState> {
    const { ref, version } = await this.versions.find(query.target);
    const eligibility = templatePreviewEligibility(version);
    if (eligibility !== 'ok') return { lookup: { status: 'none' }, eligibility };
    const lookup = await this.store.read('template-preview', ref);
    if (lookup.status === 'none' || lookup.job.status !== 'done') return { lookup, eligibility };
    if (await isTemplatePreviewPresent(this.store.location('template-preview', ref), lookup.job)) return { lookup, eligibility };
    return { lookup: { status: 'present', job: withoutClip(lookup.job) }, eligibility };
  }
}
