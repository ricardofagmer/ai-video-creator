import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { AssetVersionNotFoundError } from '../catalog.errors';
import { SkillEntryFileService, type EntryFileText } from '../skill-entry-file';
import { GetEntryFileTextQuery } from './get-entry-file-text.query';

@QueryHandler(GetEntryFileTextQuery)
export class GetEntryFileTextHandler implements IQueryHandler<GetEntryFileTextQuery, EntryFileText> {
  constructor(
    private readonly versions: AssetVersionRepository,
    private readonly entryFiles: SkillEntryFileService,
  ) {}

  async execute(query: GetEntryFileTextQuery): Promise<EntryFileText> {
    const ref = parseInput(AssetRefSchema, query.ref, 'ref');
    const { assetId, version } = parseAssetRef(ref);
    const row = await this.versions.findVersion(assetId, version);
    if (row === null) throw new AssetVersionNotFoundError(ref);
    return this.entryFiles.readText(toAssetVersion(row), query.signal);
  }
}
