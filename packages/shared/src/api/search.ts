import { z } from 'zod';
import { AssetKindSchema, AssetStatusSchema } from '../catalog/asset-kind';
import { SEMANTIC_SEARCH_QUERY_MAX_CHARS } from '../catalog/embedding';
import { AssetVersionViewSchema } from './catalog';

/** B10: results returned when `limit` is absent; at most 20. */
export const SEMANTIC_SEARCH_DEFAULT_LIMIT = 8;

/**
 * `POST /catalog/search` body (rev 3, SPEC 0003 section 5.2). A POST so the query text is a body,
 * not a URL an access log or the browser history keeps. The query is never logged; logs carry its
 * length only. Biometric versions are excluded unless `sensitivity: 'any'`, as in lexical search.
 */
export const SemanticSearchRequestSchema = z
  .object({
    query: z.string().min(1).max(SEMANTIC_SEARCH_QUERY_MAX_CHARS),
    kinds: z.array(AssetKindSchema).min(1).max(AssetKindSchema.options.length).optional(),
    statuses: z.array(AssetStatusSchema).min(1).max(AssetStatusSchema.options.length).optional(),
    sensitivity: z.enum(['any', 'exclude-biometric']).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
export type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;

/**
 * The top `limit` versions by cosine similarity, highest first, with no threshold (B10).
 * `scanned`: rows scored against the query. `pending`: rows that match the filters but have no
 * vector from the current model, so an incomplete index is visible, never silent.
 */
export const SemanticSearchResponseSchema = z
  .object({
    modelRef: z.string().min(1).max(200),
    items: z
      .array(z.object({ version: AssetVersionViewSchema, similarity: z.number().min(-1).max(1) }).strict())
      .max(20),
    scanned: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  })
  .strict();
export type SemanticSearchResponse = z.infer<typeof SemanticSearchResponseSchema>;

/**
 * `GET /catalog/search/status` (rev 3): the model state and the index counts. `model` is `absent`
 * when the model folder is not provisioned and `rejected` when its integrity check failed. Carries
 * no path and no checksum value.
 */
export const SearchIndexStatusResponseSchema = z
  .object({
    model: z.enum(['ready', 'absent', 'rejected']),
    modelRef: z.string().min(1).max(200).nullable(),
    indexed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  })
  .strict();
export type SearchIndexStatusResponse = z.infer<typeof SearchIndexStatusResponseSchema>;
