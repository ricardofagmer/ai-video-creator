import { Query } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';

/** Resolves `assetId@version` to its catalog row (no re-hash; see CatalogAssetResolver for that). */
export class GetAssetVersionQuery extends Query<AssetVersion> {
  /** C1 `AssetRef`; validated by the handler. */
  constructor(readonly ref: string) {
    super();
  }
}
