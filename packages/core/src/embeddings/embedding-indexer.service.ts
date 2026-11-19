import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import { assetRefPattern, parseAssetRef, type AssetRef } from '@studio/shared/catalog';
import { EmbeddingDocumentPlanner, type PlannedRow } from './embedding-document.planner';
import { EmbeddingIndexRepository, MAX_REFS_PER_LOOKUP, type EmbeddingSourceRow } from './embedding-index.repository';
import { EmbeddingModelRuntime } from './embedding-model.runtime';
import { serializeVector } from './vector-math';

/**
 * `studio catalog embed` scopes (SPEC 0003 section 5.2): `unindexed` (default) embeds every row
 * that is not `indexed`; `stale` only rows holding a vector of another `modelRef` (`--stale`);
 * `all` re-embeds every row (`--all`).
 */
export type EmbedScope = 'unindexed' | 'stale' | 'all';

export interface EmbeddingSyncSummary {
  readonly outcome: 'completed' | 'model-unavailable';
  readonly modelRef: string | null;
  readonly embedded: number;
  /** Rows whose document could not be built; they stay pending. */
  readonly failed: number;
  readonly durationMs: number;
}

/** Rows read per page; bounds memory, not the work done. */
const SOURCE_PAGE_SIZE = 64;
/** B9: at most 8 texts per runtime call, yielding to the event loop between calls. */
export const EMBED_BATCH_SIZE = 8;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function inScope(row: PlannedRow, scope: EmbedScope): boolean {
  if (scope === 'all') return true;
  if (scope === 'stale') return row.state === 'stale';
  return row.state !== 'indexed';
}

/**
 * `EmbeddingIndexer` of SPEC 0003 section 5.2: embeds rows whose document changed, in batches of
 * 8, on the main thread (B9). Passes in one process run one at a time (single-flight), so two
 * triggers never embed the same row concurrently. The api calls `scheduleSync()` once at start
 * and `indexRefs()` after the response of a catalog write; the CLI awaits `sync(scope)`. A save
 * never waits for the model; with the model absent or rejected nothing is written and rows stay
 * pending (R2-AC-07).
 */
@Injectable()
export class EmbeddingIndexer {
  private readonly logger = new Logger(EmbeddingIndexer.name);
  private tail: Promise<unknown> = Promise.resolve();
  private readonly queuedRefs = new Set<AssetRef>();
  private refsPassQueued = false;

  constructor(
    private readonly repository: EmbeddingIndexRepository,
    private readonly planner: EmbeddingDocumentPlanner,
    private readonly runtime: EmbeddingModelRuntime,
  ) {}

  /** `studio catalog embed [--stale | --all]`; resolves when the pass is done. */
  async sync(scope: EmbedScope = 'unindexed'): Promise<EmbeddingSyncSummary> {
    return this.serialized(() => this.syncAll(scope));
  }

  /** Api start: one background pass over every row that is not indexed. Never throws. */
  scheduleSync(): void {
    this.sync('unindexed').catch((error: unknown) => {
      this.logger.error({ event: 'embeddings.sync-failed', scope: 'unindexed', errorName: errorName(error) });
    });
  }

  /**
   * After a new version, or a learning note saved or retired (R2-AC-11; wired by R2-06/R2-08).
   * Returns at once; the refs are coalesced into one queued pass. Invalid refs are ignored.
   */
  indexRefs(refs: readonly string[]): void {
    for (const ref of refs) if (assetRefPattern.test(ref)) this.queuedRefs.add(ref);
    if (this.refsPassQueued || this.queuedRefs.size === 0) return;
    this.refsPassQueued = true;
    this.serialized(() => this.syncQueuedRefs()).catch((error: unknown) => {
      this.logger.error({ event: 'embeddings.sync-failed', scope: 'refs', errorName: errorName(error) });
    });
  }

  private serialized<T>(pass: () => Promise<T>): Promise<T> {
    const run = this.tail.then(pass, pass);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async syncAll(scope: EmbedScope): Promise<EmbeddingSyncSummary> {
    const startedAt = Date.now();
    const state = await this.runtime.state();
    if (state.status !== 'ready') return this.unavailable(state.modelRef, startedAt);
    const modelRef = state.manifest.modelRef;
    let embedded = 0;
    let failed = 0;
    let afterRowId = 0;
    for (;;) {
      const rows = await this.repository.pageSources(afterRowId, SOURCE_PAGE_SIZE);
      const last = rows.at(-1);
      if (last === undefined) break;
      afterRowId = last.id;
      const counts = await this.embedRows(rows, { modelRef, scope });
      embedded += counts.embedded;
      failed += counts.failed;
    }
    return this.completed({ scope, modelRef, embedded, failed, startedAt });
  }

  private async syncQueuedRefs(): Promise<EmbeddingSyncSummary> {
    this.refsPassQueued = false;
    const refs = [...this.queuedRefs].slice(0, MAX_REFS_PER_LOOKUP);
    for (const ref of refs) this.queuedRefs.delete(ref);
    // More refs than one lookup holds are left queued for a follow-up pass.
    if (this.queuedRefs.size > 0) this.indexRefs([]);
    const startedAt = Date.now();
    const state = await this.runtime.state();
    if (state.status !== 'ready') return this.unavailable(state.modelRef, startedAt);
    const modelRef = state.manifest.modelRef;
    const rows = await this.repository.findSourcesByRefs(refs.map(parseAssetRef));
    const counts = await this.embedRows(rows, { modelRef, scope: 'unindexed' });
    return this.completed({ scope: 'refs', modelRef, ...counts, startedAt });
  }

  private async embedRows(
    rows: readonly EmbeddingSourceRow[],
    target: { modelRef: string; scope: EmbedScope },
  ): Promise<{ embedded: number; failed: number }> {
    const plan = await this.planner.plan(rows, target.modelRef);
    for (const row of plan.failed) {
      this.logger.warn({ event: 'embeddings.document-failed', ref: row.ref, errorName: row.errorName });
    }
    const work = plan.planned.filter((row) => inScope(row, target.scope));
    let embedded = 0;
    for (let start = 0; start < work.length; start += EMBED_BATCH_SIZE) {
      embedded += await this.embedBatch(work.slice(start, start + EMBED_BATCH_SIZE), target.modelRef);
      await yieldToEventLoop();
    }
    return { embedded, failed: plan.failed.length };
  }

  private async embedBatch(batch: readonly PlannedRow[], modelRef: string): Promise<number> {
    const startedAt = Date.now();
    const { vectors } = await this.runtime.embed(
      batch.map((row) => row.document),
      'passage',
    );
    const embeddedAt = new Date();
    const durationMs = Date.now() - startedAt;
    let written = 0;
    for (const [index, row] of batch.entries()) {
      // The runtime already refused an output whose count differs from the input.
      const vector = vectors[index];
      if (vector === undefined) continue;
      await this.repository.writeEmbedding({
        rowId: row.rowId,
        vectorJson: serializeVector(vector),
        modelRef,
        inputHash: row.inputHash,
        embeddedAt,
        updatedAt: row.updatedAt,
      });
      this.logger.log({ event: 'embeddings.indexed', ref: row.ref, modelRef, documentLength: row.document.length, durationMs });
      written += 1;
    }
    return written;
  }

  private unavailable(modelRef: string | null, startedAt: number): EmbeddingSyncSummary {
    return { outcome: 'model-unavailable', modelRef, embedded: 0, failed: 0, durationMs: Date.now() - startedAt };
  }

  private completed(pass: {
    scope: EmbedScope | 'refs';
    modelRef: string;
    embedded: number;
    failed: number;
    startedAt: number;
  }): EmbeddingSyncSummary {
    const durationMs = Date.now() - pass.startedAt;
    this.logger.log({ event: 'embeddings.sync-completed', scope: pass.scope, modelRef: pass.modelRef, embedded: pass.embedded, failed: pass.failed, durationMs });
    return { outcome: 'completed', modelRef: pass.modelRef, embedded: pass.embedded, failed: pass.failed, durationMs };
  }
}
