import { Query } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { type SemanticSearchRequest } from '@studio/shared/api';

export interface SemanticSearchHit {
  /** The C1 version in the default read projection: it never carries `embedding` (L8). */
  readonly version: AssetVersion;
  /** Cosine similarity in [-1, 1]. */
  readonly similarity: number;
}

/**
 * Core's answer to `POST /catalog/search` and `studio catalog search --semantic` (SPEC 0003
 * section 5.2). The api maps each version to `AssetVersionView` to build `SemanticSearchResponse`.
 */
export interface SemanticSearchResult {
  readonly modelRef: string;
  readonly items: readonly SemanticSearchHit[];
  /** Rows scored against the query. */
  readonly scanned: number;
  /** Rows matching the filters without a vector of the current model (never silent). */
  readonly pending: number;
}

export interface SemanticSearchContext {
  /** From `x-request-id`; null on the CLI. */
  readonly correlationId: string | null;
}

/**
 * Search by meaning, its own route and mode (B10). The request is re-validated by the handler with
 * `SemanticSearchRequestSchema`, so the CLI and the api share one boundary.
 */
export class SemanticSearchQuery extends Query<SemanticSearchResult> {
  constructor(
    readonly request: SemanticSearchRequest,
    readonly context: SemanticSearchContext = { correlationId: null },
  ) {
    super();
  }
}
