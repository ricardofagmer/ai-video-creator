import { Injectable } from '@nestjs/common';
import { EmbeddingIndexRepository, type VectorKeyRow } from './embedding-index.repository';
import { parseStoredVector } from './vector-math';

/** About 15 MB of 384-dimension vectors; the ADR 0004 revisit trigger is 10,000 rows. */
const MAX_CACHED_VECTORS = 10_000;

interface CachedVector {
  inputHash: string;
  vector: Float32Array;
}

/**
 * Parsed vectors kept in the api's memory, keyed by row id and input hash (SPEC 0003 section 5.2
 * query flow step 3): a re-embedded row has a new hash and is reloaded. Only rows embedded by the
 * current `modelRef` are ever returned (R2-AC-09). Vectors stay in this process: nothing here is
 * logged, exported or put on a view.
 */
@Injectable()
export class StoredVectorCache {
  private readonly vectors = new Map<number, CachedVector>();

  constructor(private readonly repository: EmbeddingIndexRepository) {}

  /**
   * Vectors of the rows of one scan page that hold a current vector of `modelRef`. Rows missing
   * from the result have no usable vector and count as pending.
   */
  async vectorsFor(rows: readonly VectorKeyRow[], model: { modelRef: string; dimensions: number }): Promise<Map<number, Float32Array>> {
    const found = new Map<number, Float32Array>();
    const misses: number[] = [];
    for (const row of rows) {
      if (row.embeddingModel !== model.modelRef || row.embeddingInputHash === null) continue;
      const cached = this.vectors.get(row.id);
      if (cached !== undefined && cached.inputHash === row.embeddingInputHash) found.set(row.id, cached.vector);
      else misses.push(row.id);
    }
    for (const stored of await this.repository.findVectorTexts(misses)) {
      if (stored.vectorJson === null || stored.inputHash === null) continue;
      const vector = parseStoredVector(stored.vectorJson, model.dimensions);
      if (vector === null) continue;
      this.remember(stored.rowId, { inputHash: stored.inputHash, vector });
      found.set(stored.rowId, vector);
    }
    return found;
  }

  private remember(rowId: number, entry: CachedVector): void {
    // A catalog past the cap is past the ADR 0004 revisit trigger; dropping the cache keeps memory bounded.
    if (this.vectors.size >= MAX_CACHED_VECTORS && !this.vectors.has(rowId)) this.vectors.clear();
    this.vectors.set(rowId, entry);
  }
}
