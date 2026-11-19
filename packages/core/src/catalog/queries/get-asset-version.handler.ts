import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AssetRefSchema, parseAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { AssetVersionNotFoundError } from '../catalog.errors';
import { GetAssetVersionQuery } from './get-asset-version.query';

@QueryHandler(GetAssetVersionQuery)
export class GetAssetVersionHandler implements IQueryHandler<GetAssetVersionQuery, AssetVersion> {
  constructor(private readonly versions: AssetVersionRepository) {}

  async execute(query: GetAssetVersionQuery): Promise<AssetVersion> {
    const ref = parseInput(AssetRefSchema, query.ref, 'ref');
    const { assetId, version } = parseAssetRef(ref);
    const row = await this.versions.findVersion(assetId, version);
    if (row === null) throw new AssetVersionNotFoundError(ref);
    return toAssetVersion(row);
  }
}
