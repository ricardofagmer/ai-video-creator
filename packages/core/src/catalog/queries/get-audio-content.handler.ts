import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AssetRefSchema, parseAssetRef, type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { ContentStore } from '../../asset-store/content-store';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { AssetVersionNotFoundError, AudioContentUnavailableError } from '../catalog.errors';
import { GetAudioContentQuery, type StoredAudioContent } from './get-audio-content.query';

/** The audio types the catalog stores for music (`catalog.limits.ts`); anything else is never served. */
const PLAYABLE_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
]);

/**
 * Only music the studio stored itself is served: a typed reference path is never read for the
 * web, and biometric material never travels as bytes.
 */
function checkPlayable(ref: AssetRef, version: AssetVersion): void {
  if (version.kind !== 'music') throw new AudioContentUnavailableError(ref, 'not-music');
  if (version.sensitivity === 'biometric') throw new AudioContentUnavailableError(ref, 'biometric');
  if (version.layout !== 'file') throw new AudioContentUnavailableError(ref, 'not-a-file');
  if (version.storage.mode !== 'store') throw new AudioContentUnavailableError(ref, 'not-stored');
  if (!PLAYABLE_AUDIO_TYPES.has(version.mimeType)) throw new AudioContentUnavailableError(ref, 'not-playable');
}

@QueryHandler(GetAudioContentQuery)
export class GetAudioContentHandler implements IQueryHandler<GetAudioContentQuery, StoredAudioContent> {
  constructor(
    private readonly versions: AssetVersionRepository,
    private readonly store: ContentStore,
  ) {}

  async execute(query: GetAudioContentQuery): Promise<StoredAudioContent> {
    const ref = parseInput(AssetRefSchema, query.ref, 'ref');
    const { assetId, version } = parseAssetRef(ref);
    const row = await this.versions.findVersion(assetId, version);
    if (row === null) throw new AssetVersionNotFoundError(ref);
    const music = toAssetVersion(row);
    checkPlayable(ref, music);
    return { absolutePath: this.store.blobPath(music.contentHash), contentType: music.mimeType, sizeBytes: music.sizeBytes };
  }
}
