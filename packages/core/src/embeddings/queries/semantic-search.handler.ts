import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { SEMANTIC_SEARCH_QUERY_MAX_CHARS } from '@studio/shared/catalog';
import { SEMANTIC_SEARCH_DEFAULT_LIMIT, SemanticSearchRequestSchema } from '@studio/shared/api';
import { toAssetVersion } from '../../catalog/asset-version.mapper';
import { EmbeddingOutputInvalidError, InvalidSemanticSearchError } from '../embeddings.errors';
import { EmbeddingIndexRepository, type VectorScanFilter } from '../embedding-index.repository';
import { EmbeddingModelRuntime } from '../embedding-model.runtime';
import { StoredVectorCache } from '../stored-vector.cache';
import { TopSimilarities } from '../top-similarities';
import { cosineOfUnitVectors } from '../vector-math';
import { SemanticSearchQuery, type SemanticSearchHit, type SemanticSearchResult } from './semantic-search.query';

/** Rows per scan page; bounds memory, every matching row is still scored. */
const SCAN_PAGE_SIZE = 500;

interface ValidSearch {
  query: string;
  filter: VectorScanFilter;
  limit: number;
}

/** Step 1 of the query flow: strict body, then NFC and trim, then the 1..500 length rule. */
function validate(request: unknown): ValidSearch {
  const parsed = SemanticSearchRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new InvalidSemanticSearchError(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  const query = parsed.data.query.normalize('NFC').trim();
  if (query.length === 0 || query.length > SEMANTIC_SEARCH_QUERY_MAX_CHARS) {
    throw new InvalidSemanticSearchError([{ path: 'query', message: `expected 1 to ${SEMANTIC_SEARCH_QUERY_MAX_CHARS} characters` }]);
  }
  return {
    query,
    filter: {
      kinds: parsed.data.kinds ?? null,
      statuses: parsed.data.statuses ?? null,
      excludeBiometric: parsed.data.sensitivity !== 'any',
    },
    limit: parsed.data.limit ?? SEMANTIC_SEARCH_DEFAULT_LIMIT,
  };
}

/**
 * `POST /catalog/search` (SPEC 0003 section 5.2 query flow): embeds the query locally, scans every
 * candidate row by dot product and returns the top `limit` with no threshold (B10). Biometric rows
 * are excluded unless `sensitivity: 'any'` (R2-AC-08). Only rows embedded by the current
 * `modelRef` are scored; the others are counted in `pending` (R2-AC-09). A model that is not ready
 * throws `EmbeddingUnavailableError` (503). The query text reaches no SQL, shell, path or log:
 * logs carry its length only (R2-AC-10).
 */
@QueryHandler(SemanticSearchQuery)
export class SemanticSearchHandler implements IQueryHandler<SemanticSearchQuery, SemanticSearchResult> {
  private readonly logger = new Logger(SemanticSearchHandler.name);

  constructor(
    private readonly runtime: EmbeddingModelRuntime,
    private readonly repository: EmbeddingIndexRepository,
    private readonly vectorCache: StoredVectorCache,
  ) {}

  async execute(query: SemanticSearchQuery): Promise<SemanticSearchResult> {
    const startedAt = Date.now();
    const search = validate(query.request);
    const { manifest, vectors } = await this.runtime.embed([search.query], 'query');
    const queryVector = vectors[0];
    if (queryVector === undefined) throw new EmbeddingOutputInvalidError('count');
    const ranking = new TopSimilarities(search.limit);
    let scanned = 0;
    let pending = 0;
    let afterRowId = 0;
    for (;;) {
      const rows = await this.repository.pageVectorKeys(search.filter, afterRowId, SCAN_PAGE_SIZE);
      const last = rows.at(-1);
      if (last === undefined) break;
      afterRowId = last.id;
      const stored = await this.vectorCache.vectorsFor(rows, manifest);
      for (const row of rows) {
        const vector = stored.get(row.id);
        if (vector === undefined) {
          pending += 1;
          continue;
        }
        scanned += 1;
        ranking.offer({ rowId: row.id, similarity: cosineOfUnitVectors(queryVector, vector) });
      }
    }
    const items = await this.loadHits(ranking);
    this.logger.log({
      event: 'embeddings.search',
      correlationId: query.context.correlationId,
      queryLength: search.query.length,
      filters: { kinds: search.filter.kinds, statuses: search.filter.statuses, excludeBiometric: search.filter.excludeBiometric, limit: search.limit },
      scanned,
      pending,
      resultCount: items.length,
      durationMs: Date.now() - startedAt,
    });
    return { modelRef: manifest.modelRef, items, scanned, pending };
  }

  private async loadHits(ranking: TopSimilarities): Promise<SemanticSearchHit[]> {
    const ranked = ranking.results();
    const rows = await this.repository.findVersionsByRowIds(ranked.map((row) => row.rowId));
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const hits: SemanticSearchHit[] = [];
    for (const { rowId, similarity } of ranked) {
      const row = rowsById.get(rowId);
      if (row !== undefined) hits.push({ version: toAssetVersion(row), similarity });
    }
    return hits;
  }
}
