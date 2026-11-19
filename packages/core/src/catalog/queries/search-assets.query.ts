import { Query } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetKindSchema, AssetStatusSchema, TagSchema } from '@studio/shared/catalog';
import { PageCursorSchema, versionOrderShape } from '../asset-version.ordering';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type AssetVersionPage } from './asset-version-page';

/** Words beyond this are ignored; topology 3.2 asks for words, not sentences. */
export const MAX_SEARCH_WORDS = 8;

/**
 * Lexical catalog search (search by meaning is the embeddings module of R2-03). `sensitivity`
 * defaults to excluding biometric rows (fail closed); the owner's catalog view passes `any`
 * explicitly. CatalogSearchTool (R1-13) passes `statuses: ['active']`,
 * `sensitivity: 'exclude-biometric'` and the recipe's kinds, and none of the rev 3 fields.
 * Rev 3 (SPEC 0003 section 4.3), all optional: `sort` (`recent`, the default and the rev 2 order,
 * or `quality`: score descending, ties by row id descending, null scores last), `minQuality`
 * (excludes null scores) and `minSampleSize`. `cursor` is opaque and valid only with the `sort`
 * that produced it; a numeric rev 2 cursor stays valid for `recent`.
 */
export const SearchAssetsCriteriaSchema = z
  .object({
    text: z.string().max(200).optional(),
    kinds: z.array(AssetKindSchema).min(1).max(AssetKindSchema.options.length).optional(),
    tags: z.array(TagSchema).max(8).optional(),
    statuses: z.array(AssetStatusSchema).min(1).max(AssetStatusSchema.options.length).optional(),
    sensitivity: z.enum(['any', 'exclude-biometric']).default('exclude-biometric'),
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    cursor: PageCursorSchema.optional(),
    ...versionOrderShape,
  })
  .strict();
export type SearchAssetsCriteria = z.input<typeof SearchAssetsCriteriaSchema>;

export class SearchAssetsQuery extends Query<AssetVersionPage> {
  constructor(readonly criteria: SearchAssetsCriteria = {}) {
    super();
  }
}
