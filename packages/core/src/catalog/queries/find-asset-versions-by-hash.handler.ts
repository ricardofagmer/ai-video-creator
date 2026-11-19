import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Sha256Schema, type AssetVersion } from '@studio/shared/catalog';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { FindAssetVersionsByContentHashQuery } from './find-asset-versions-by-hash.query';

@QueryHandler(FindAssetVersionsByContentHashQuery)
export class FindAssetVersionsByContentHashHandler
  implements IQueryHandler<FindAssetVersionsByContentHashQuery, AssetVersion[]>
{
  constructor(private readonly versions: AssetVersionRepository) {}

  async execute(query: FindAssetVersionsByContentHashQuery): Promise<AssetVersion[]> {
    const contentHash = parseInput(Sha256Schema, query.contentHash, 'contentHash');
    const rows = await this.versions.findByContentHash(contentHash);
    return rows.map(toAssetVersion);
  }
}
