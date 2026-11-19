import { z } from 'zod';
import { type AssetVersion } from '@studio/shared/catalog';
import { toAssetVersion } from '../asset-version.mapper';
import {
  PageCursorSchema,
  decodeVersionCursor,
  encodeVersionCursor,
  versionOrderShape,
  type QualityFilter,
  type VersionSort,
} from '../asset-version.ordering';
import { type KeysetPage, type RowPage } from '../asset-version.repository';

/** rules/backend.md pagination: default 20, max 100. */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * Version history page request. Rev 3 adds the optional `sort`, `minQuality` and `minSampleSize`
 * (SPEC 0003 section 4.3); without them the page is the rev 2 one (oldest first, numeric cursor).
 */
export const PageRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    cursor: PageCursorSchema.optional(),
    ...versionOrderShape,
  })
  .strict();
export type PageRequest = z.input<typeof PageRequestSchema>;

export interface AssetVersionPage {
  items: AssetVersion[];
  /** Matching versions in total, independent of the cursor. */
  total: number;
  /** Pass back as `cursor` (with the same `sort`) for the next page; null on the last page. */
  nextCursor: string | null;
}

export function toKeysetPage(request: { sort: VersionSort; limit: number; cursor?: string | undefined }): KeysetPage {
  return { position: decodeVersionCursor(request.sort, request.cursor), limit: request.limit };
}

export function toQualityFilter(request: { minQuality?: number | undefined; minSampleSize?: number | undefined }): QualityFilter {
  return { minQuality: request.minQuality ?? null, minSampleSize: request.minSampleSize ?? null };
}

export function toAssetVersionPage(page: RowPage, sort: VersionSort): AssetVersionPage {
  const last = page.rows.at(-1);
  return {
    items: page.rows.map(toAssetVersion),
    total: page.total,
    nextCursor: page.hasMore && last !== undefined ? encodeVersionCursor(sort, last) : null,
  };
}
