import { Command } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { type NewAssetContentInput } from '../asset-content';
import { type AssetVersionMetadataInput } from '../asset-version.factory';

export interface CreateAssetInput {
  /** C1 `AssetId`; validated by the handler. */
  assetId: string;
  /** C1 `AssetKind`; fixed for the life of the asset. */
  kind: string;
  metadata: AssetVersionMetadataInput;
  content: NewAssetContentInput;
  signal?: AbortSignal;
}

/** Creates an asset and its version 1 as `draft` (PRD 5.3). */
export class CreateAssetCommand extends Command<AssetVersion> {
  constructor(readonly input: CreateAssetInput) {
    super();
  }
}
