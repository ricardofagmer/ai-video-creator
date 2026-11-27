import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { formatAssetRef, type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { GetAssetVersionQuery } from '../catalog';
import { isVoiceVersion, type VoiceVersion } from './asset-job-policy';
import { AssetJobNotAVoiceError } from './asset-jobs.errors';
import { AssetJobTargetSchema, parseAssetJobInput, type AssetJobTarget } from './asset-jobs.input';

export interface ResolvedVersion<Version extends AssetVersion> {
  ref: AssetRef;
  version: Version;
}

/**
 * The catalog row behind an asset job route, through the catalog's own query: an unknown version
 * is `AssetVersionNotFoundError` (404), exactly as every catalog route reports it.
 */
@Injectable()
export class AssetJobVersions {
  constructor(private readonly queryBus: QueryBus) {}

  async find(target: AssetJobTarget): Promise<ResolvedVersion<AssetVersion>> {
    const parsed = parseAssetJobInput(AssetJobTargetSchema, target);
    const ref = formatAssetRef({ assetId: parsed.assetId, version: parsed.version });
    return { ref, version: await this.queryBus.execute(new GetAssetVersionQuery(ref)) };
  }

  /** 422 `asset-job-not-a-voice` for any version that has nothing to speak with. */
  async voice(target: AssetJobTarget): Promise<ResolvedVersion<VoiceVersion>> {
    const { ref, version } = await this.find(target);
    if (!isVoiceVersion(version)) throw new AssetJobNotAVoiceError(ref);
    return { ref, version };
  }
}
