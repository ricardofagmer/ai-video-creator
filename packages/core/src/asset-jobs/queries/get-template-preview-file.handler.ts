import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { templatePreviewEligibility } from '../asset-job-policy';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { AssetJobSampleNotReadyError } from '../asset-jobs.errors';
import { checkTemplatePreviewFile } from '../template-preview-files';
import { GetTemplatePreviewFileQuery, type TemplatePreviewMedia } from './get-template-preview-file.query';

/** Reads only. Every refusal is the same 404; the log names the check, never the path. */
@QueryHandler(GetTemplatePreviewFileQuery)
export class GetTemplatePreviewFileHandler implements IQueryHandler<GetTemplatePreviewFileQuery, TemplatePreviewMedia> {
  private readonly logger = new Logger(GetTemplatePreviewFileHandler.name);

  constructor(
    private readonly versions: AssetJobVersions,
    private readonly store: AssetJobStore,
  ) {}

  async execute(query: GetTemplatePreviewFileQuery): Promise<TemplatePreviewMedia> {
    const { ref, version } = await this.versions.find(query.target);
    if (templatePreviewEligibility(version) !== 'ok') throw new AssetJobSampleNotReadyError(ref);
    const lookup = await this.store.read('template-preview', ref);
    if (lookup.status === 'none') throw new AssetJobSampleNotReadyError(ref);
    const checked = await checkTemplatePreviewFile(this.store.location('template-preview', ref), lookup.job, query.file);
    if (checked.status === 'refused') {
      if (checked.check !== 'not-done') this.logger.warn({ event: 'asset-job.preview-refused', ref, file: query.file, check: checked.check });
      throw new AssetJobSampleNotReadyError(ref);
    }
    return {
      absolutePath: checked.absolutePath,
      contentType: query.file === 'clip' ? 'video/mp4' : 'image/png',
      sizeBytes: checked.sizeBytes,
    };
  }
}
