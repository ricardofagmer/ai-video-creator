import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { parseInput } from '../asset-version.factory';
import { AssetVersionRepository } from '../asset-version.repository';
import { toAssetVersionPage, toKeysetPage, toQualityFilter, type AssetVersionPage } from './asset-version-page';
import { MAX_SEARCH_WORDS, SearchAssetsCriteriaSchema, SearchAssetsQuery } from './search-assets.query';

/**
 * Splits free text into lowercase words of letters, digits and hyphens. Everything else is a
 * separator, so LIKE wildcards (`%`, `_`) and quotes never reach the query.
 */
export function searchWords(text: string | undefined): string[] {
  if (text === undefined) return [];
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((word) => word !== '' && word !== '-')
    .slice(0, MAX_SEARCH_WORDS);
}

@QueryHandler(SearchAssetsQuery)
export class SearchAssetsHandler implements IQueryHandler<SearchAssetsQuery, AssetVersionPage> {
  constructor(private readonly versions: AssetVersionRepository) {}

  async execute(query: SearchAssetsQuery): Promise<AssetVersionPage> {
    const criteria = parseInput(SearchAssetsCriteriaSchema, query.criteria, 'criteria');
    const keyset = toKeysetPage({ sort: criteria.sort, limit: criteria.limit, cursor: criteria.cursor });
    const page = await this.versions.search(
      {
        words: searchWords(criteria.text),
        tags: criteria.tags ?? [],
        kinds: criteria.kinds ?? null,
        statuses: criteria.statuses ?? null,
        excludeBiometric: criteria.sensitivity === 'exclude-biometric',
        quality: toQualityFilter(criteria),
      },
      keyset,
    );
    return toAssetVersionPage(page, criteria.sort);
  }
}
