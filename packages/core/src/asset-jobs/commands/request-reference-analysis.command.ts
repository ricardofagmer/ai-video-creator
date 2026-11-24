import { Command } from '@nestjs/cqrs';
import { type ReferenceAnalysisJobFile } from '@studio/shared/asset-jobs';
import { type AssetJobTarget } from '../asset-jobs.input';

/**
 * `POST /catalog/assets/:assetId/versions/:version/reference-analysis` (guided-creation design
 * section 4): asks again for a version's analysis. An open or `done` job is returned as it is (no
 * second bill); a `failed` or `refused` one is replaced. Only a stored, non-biometric video file of
 * a `video` reference can be analysed.
 */
export class RequestReferenceAnalysisCommand extends Command<ReferenceAnalysisJobFile> {
  /** Validated by the handler. */
  constructor(readonly target: AssetJobTarget) {
    super();
  }
}
