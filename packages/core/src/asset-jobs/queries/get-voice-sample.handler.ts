import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { AssetJobStore, type AssetJobLookup } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { isVoiceSampleClipPresent } from '../voice-sample-clips';
import { GetVoiceSampleQuery } from './get-voice-sample.query';

/** The job without its clip format: what a done job with nothing on disk can honestly say. */
function withoutAudio(job: VoiceSampleJobFile): VoiceSampleJobFile {
  return { ...job, audio: undefined };
}

/**
 * Reads only. A `done` job whose clip is gone from disk is returned without `audio`, so the view
 * maps it to `audio: null` and no screen offers a clip the audio route would refuse; asking again
 * replaces it (`RequestVoiceSampleCommand`). `job.json` itself is never rewritten here.
 */
@QueryHandler(GetVoiceSampleQuery)
export class GetVoiceSampleHandler implements IQueryHandler<GetVoiceSampleQuery, AssetJobLookup<VoiceSampleJobFile>> {
  constructor(
    private readonly versions: AssetJobVersions,
    private readonly store: AssetJobStore,
  ) {}

  async execute(query: GetVoiceSampleQuery): Promise<AssetJobLookup<VoiceSampleJobFile>> {
    const { ref } = await this.versions.voice(query.target);
    const lookup = await this.store.read('voice-sample', ref);
    if (lookup.status === 'none' || lookup.job.status !== 'done') return lookup;
    if (await isVoiceSampleClipPresent(this.store.location('voice-sample', ref), lookup.job)) return lookup;
    return { status: 'present', job: withoutAudio(lookup.job) };
  }
}
