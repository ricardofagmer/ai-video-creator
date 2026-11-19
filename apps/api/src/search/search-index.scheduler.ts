import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EmbeddingIndexer } from '@studio/core/embeddings';
import { type Response } from 'express';

/**
 * Keeps the semantic index current from the api (SPEC 0003 section 5.2, B9): one background pass at
 * start, and a pass over the changed versions after the response of every catalog write that can
 * change a search document (a new version, a learning saved or retired). A save never waits for
 * the model; with the model absent or rejected the indexer writes nothing and rows stay pending.
 */
@Injectable()
export class SearchIndexScheduler implements OnApplicationBootstrap {
  constructor(private readonly indexer: EmbeddingIndexer) {}

  /** The indexer's start pass runs in the background and never throws. */
  onApplicationBootstrap(): void {
    this.indexer.scheduleSync();
  }

  /**
   * Queues the refs once the response is complete. `close` also fires when the client left early;
   * the write is committed either way, so the version is still indexed. A response already
   * closed before this call is indexed at once.
   */
  afterResponse(response: Response, refs: readonly string[]): void {
    if (response.closed) {
      this.indexer.indexRefs(refs);
      return;
    }
    response.once('close', () => this.indexer.indexRefs(refs));
  }
}
