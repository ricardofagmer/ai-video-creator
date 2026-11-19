import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { parseAssetId, parseInput } from '../asset-version.factory';
import { AssetVersionRepository } from '../asset-version.repository';
import { AssetNotFoundError } from '../catalog.errors';
import { PageRequestSchema, toAssetVersionPage, toKeysetPage, toQualityFilter, type AssetVersionPage } from './asset-version-page';
import { ListAssetVersionsQuery } from './list-asset-versions.query';

@QueryHandler(ListAssetVersionsQuery)
export class ListAssetVersionsHandler implements IQueryHandler<ListAssetVersionsQuery, AssetVersionPage> {
  constructor(private readonly versions: AssetVersionRepository) {}

  async execute(query: ListAssetVersionsQuery): Promise<AssetVersionPage> {
    const assetId = parseAssetId(query.assetId);
    const page = parseInput(PageRequestSchema, query.page, 'page');
    const keyset = toKeysetPage(page);
    if ((await this.versions.findAsset(assetId)) === null) throw new AssetNotFoundError(assetId);
    return toAssetVersionPage(await this.versions.listVersions(assetId, toQualityFilter(page), keyset), page.sort);
  }
}
