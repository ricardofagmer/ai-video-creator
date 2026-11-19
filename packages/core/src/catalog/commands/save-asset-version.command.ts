import { Command } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { type AssetContentInput } from '../asset-content';
import { type AssetVersionMetadataInput } from '../asset-version.factory';

export interface SaveAssetVersionInput {
  /** C1 `AssetId` of an existing asset. */
  assetId: string;
  /** The full metadata of the new version; nothing is inherited implicitly. */
  metadata: AssetVersionMetadataInput;
  /** New bytes, or `previous-version` to keep the bytes of an earlier version (metadata edit). */
  content: AssetContentInput;
  signal?: AbortSignal;
}

/**
 * An edit (PRD 5.4 rule 1, criterion 6): inserts version N+1 as `draft` and never touches
 * version N's row or blob.
 */
export class SaveAssetVersionCommand extends Command<AssetVersion> {
  constructor(readonly input: SaveAssetVersionInput) {
    super();
  }
}
