import { Query } from '@nestjs/cqrs';
import { type AssetJobTarget } from '../asset-jobs.input';
import { type TemplatePreviewFile } from '../template-preview-files';

/** A done preview's clip or poster, for the api to stream. `absolutePath` is never logged or returned. */
export interface TemplatePreviewMedia {
  absolutePath: string;
  contentType: 'video/mp4' | 'image/png';
  sizeBytes: number;
}

/** `GET .../template-preview/clip|poster`: 404 `asset-job-sample-not-ready` unless the job is done with its files. */
export class GetTemplatePreviewFileQuery extends Query<TemplatePreviewMedia> {
  /** `target` is validated by the handler. */
  constructor(
    readonly target: AssetJobTarget,
    readonly file: TemplatePreviewFile,
  ) {
    super();
  }
}
