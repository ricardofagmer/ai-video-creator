import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AssetRefSchema, parseAssetRef, type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { ContentStore } from '../../asset-store/content-store';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { AssetVersionNotFoundError, ImageContentUnavailableError } from '../catalog.errors';
import { GetImageContentQuery, type StoredImageContent } from './get-image-content.query';

/** The browser decodes these safely in an `<img>`; SVG and anything else is never served. */
const PREVIEWABLE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Only content the studio stored itself is served: a typed reference path is never read for the
 * web, and biometric material never travels as bytes.
 */
function checkPreviewable(ref: AssetRef, version: AssetVersion): void {
  if (version.kind !== 'image') throw new ImageContentUnavailableError(ref, 'not-an-image');
  if (version.sensitivity === 'biometric') throw new ImageContentUnavailableError(ref, 'biometric');
  if (version.layout !== 'file') throw new ImageContentUnavailableError(ref, 'not-a-file');
  if (version.storage.mode !== 'store') throw new ImageContentUnavailableError(ref, 'not-stored');
  if (!PREVIEWABLE_IMAGE_TYPES.has(version.mimeType)) throw new ImageContentUnavailableError(ref, 'not-previewable');
}

@QueryHandler(GetImageContentQuery)
export class GetImageContentHandler implements IQueryHandler<GetImageContentQuery, StoredImageContent> {
  constructor(
    private readonly versions: AssetVersionRepository,
    private readonly store: ContentStore,
  ) {}

  async execute(query: GetImageContentQuery): Promise<StoredImageContent> {
    const ref = parseInput(AssetRefSchema, query.ref, 'ref');
    const { assetId, version } = parseAssetRef(ref);
    const row = await this.versions.findVersion(assetId, version);
    if (row === null) throw new AssetVersionNotFoundError(ref);
    const image = toAssetVersion(row);
    checkPreviewable(ref, image);
    return { absolutePath: this.store.blobPath(image.contentHash), contentType: image.mimeType, sizeBytes: image.sizeBytes };
  }
}
