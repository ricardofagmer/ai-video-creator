import { Query } from '@nestjs/cqrs';
import { type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { type AssetJobLookup } from '../asset-job-store';
import { type AssetJobTarget } from '../asset-jobs.input';

/** `GET .../voice-sample`: the version's job, or `none`. 404 for an unknown version, 422 for a non-voice. */
export class GetVoiceSampleQuery extends Query<AssetJobLookup<VoiceSampleJobFile>> {
  /** Validated by the handler. */
  constructor(readonly target: AssetJobTarget) {
    super();
  }
}
