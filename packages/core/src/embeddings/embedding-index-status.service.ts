import { Injectable } from '@nestjs/common';
import { assetRefPattern, parseAssetRef, type AssetRef } from '@studio/shared/catalog';
import { EmbeddingDocumentPlanner, type IndexRowState } from './embedding-document.planner';
import { EmbeddingIndexRepository, MAX_REFS_PER_LOOKUP, type EmbeddingSourceRow } from './embedding-index.repository';
import { EmbeddingModelRuntime } from './embedding-model.runtime';

/** The `searchIndex` field of `AssetVersionView` (rev 3). */
export type SearchIndexState = IndexRowState | 'unavailable';

/** Core's `SearchIndexStatusResponse`: no path, no checksum value. */
export interface SearchIndexStatus {
  readonly model: 'ready' | 'absent' | 'rejected';
  readonly modelRef: string | null;
  readonly indexed: number;
  readonly pending: number;
  readonly stale: number;
}

const STATUS_PAGE_SIZE = 64;

interface IndexCounts {
  indexed: number;
  pending: number;
  stale: number;
}

/**
 * Index state for `GET /catalog/search/status`, `studio doctor` and the per-version `searchIndex`
 * of the api views. A row counts as `indexed` only when its stored input hash equals the hash of
 * the document built now, the same rule the indexer uses, so a learning note saved a moment ago
 * shows as `pending` until the indexer catches up.
 */
@Injectable()
export class EmbeddingIndexStatusService {
  constructor(
    private readonly repository: EmbeddingIndexRepository,
    private readonly planner: EmbeddingDocumentPlanner,
    private readonly runtime: EmbeddingModelRuntime,
  ) {}

  async status(): Promise<SearchIndexStatus> {
    const state = await this.runtime.state();
    const modelRef = state.status === 'ready' ? state.manifest.modelRef : state.modelRef;
    const counts: IndexCounts = { indexed: 0, pending: 0, stale: 0 };
    let afterRowId = 0;
    for (;;) {
      const rows = await this.repository.pageSources(afterRowId, STATUS_PAGE_SIZE);
      const last = rows.at(-1);
      if (last === undefined) break;
      afterRowId = last.id;
      await this.count(rows, modelRef, counts);
    }
    return { model: state.status, modelRef, ...counts };
  }

  /** `unavailable` for every ref while the model is not ready; unknown refs are left out. */
  async statesForRefs(refs: readonly AssetRef[]): Promise<Map<AssetRef, SearchIndexState>> {
    const states = new Map<AssetRef, SearchIndexState>();
    const wanted = refs.filter((ref) => assetRefPattern.test(ref)).slice(0, MAX_REFS_PER_LOOKUP);
    const state = await this.runtime.state();
    if (state.status !== 'ready') {
      for (const ref of wanted) states.set(ref, 'unavailable');
      return states;
    }
    const rows = await this.repository.findSourcesByRefs(wanted.map(parseAssetRef));
    const plan = await this.planner.plan(rows, state.manifest.modelRef);
    for (const row of plan.failed) states.set(row.ref, 'pending');
    for (const row of plan.planned) states.set(row.ref, row.state);
    return states;
  }

  private async count(rows: readonly EmbeddingSourceRow[], modelRef: string | null, counts: IndexCounts): Promise<void> {
    if (modelRef === null) {
      // No usable manifest: nothing can be current, and any stored vector is of an unknown model.
      for (const row of rows) counts[row.embeddingModel === null ? 'pending' : 'stale'] += 1;
      return;
    }
    const plan = await this.planner.plan(rows, modelRef);
    counts.pending += plan.failed.length;
    for (const row of plan.planned) counts[row.state] += 1;
  }
}
