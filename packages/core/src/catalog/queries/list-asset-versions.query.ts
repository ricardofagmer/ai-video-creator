import { Query } from '@nestjs/cqrs';
import { type AssetVersionPage, type PageRequest } from './asset-version-page';

/** Version history of one asset, oldest first, paginated (PRD 5.4; web version history). */
export class ListAssetVersionsQuery extends Query<AssetVersionPage> {
  constructor(
    /** C1 `AssetId`; validated by the handler. */
    readonly assetId: string,
    readonly page: PageRequest = {},
  ) {
    super();
  }
}
