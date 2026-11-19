import { type QueryBus } from '@nestjs/cqrs';
import { MAX_PAGE_LIMIT, SearchAssetsQuery } from '@studio/core/catalog';
import { type AssetVersion } from '@studio/shared/catalog';
import { CatalogScanLimitError } from '../errors/cli.errors.js';

/** Far above a single owner's catalog; past it a scan stops instead of reporting a partial answer. */
export const MAX_SCANNED_VERSIONS = 10_000;

/**
 * Every catalog version, biometric rows included, through the core `SearchAssetsQuery` (read
 * side of the CQRS bus, keyset pages of `MAX_PAGE_LIMIT`). Used by `doctor` and the biometric
 * check of `catalog import`; neither needs a query of its own in core.
 */
export async function scanCatalogVersions(queryBus: QueryBus, signal: AbortSignal): Promise<AssetVersion[]> {
  const versions: AssetVersion[] = [];
  let cursor: string | undefined;
  for (;;) {
    signal.throwIfAborted();
    const page = await queryBus.execute(new SearchAssetsQuery({ sensitivity: 'any', limit: MAX_PAGE_LIMIT, cursor }));
    versions.push(...page.items);
    if (versions.length > MAX_SCANNED_VERSIONS) throw new CatalogScanLimitError(MAX_SCANNED_VERSIONS);
    if (page.nextCursor === null) return versions;
    cursor = page.nextCursor;
  }
}
