import { Injectable } from '@nestjs/common';
import { type AssetRef, type Sha256 } from '@studio/shared/catalog';
import { sha256Hex } from '../asset-store';
import { buildEmbeddingDocument } from './embedding-document';
import { EmbeddingIndexRepository, type EmbeddingSourceRow } from './embedding-index.repository';
import { refOfRow, toEmbeddingSource } from './embedding-source.mapper';
import { ContentStoreTextReader } from './stored-text.reader';

/** A row's place in the semantic index for one `modelRef` (SPEC 0003 section 5.2 "When"). */
export type IndexRowState = 'indexed' | 'pending' | 'stale';

export interface PlannedRow {
  readonly rowId: number;
  readonly ref: AssetRef;
  readonly document: string;
  readonly inputHash: Sha256;
  readonly state: IndexRowState;
  readonly updatedAt: Date;
}

export interface UnplannableRow {
  readonly rowId: number;
  readonly ref: AssetRef;
  readonly errorName: string;
}

export interface IndexPlan {
  readonly planned: readonly PlannedRow[];
  /** Rows whose document could not be built; they stay pending and are logged by ref. */
  readonly failed: readonly UnplannableRow[];
}

/** `embedding_input_hash`: sha-256 of `modelRef`, a newline and the document. */
export function embeddingInputHash(modelRef: string, document: string): Sha256 {
  return sha256Hex(`${modelRef}\n${document}`);
}

/**
 * `indexed` when the stored hash equals the hash computed now (so the model and the document are
 * both current); `stale` when the row holds a vector of another `modelRef`; `pending` otherwise
 * (never embedded, or embedded by this model from a document that has since changed).
 */
export function indexRowState(
  row: { embeddingModel: string | null; embeddingInputHash: string | null },
  modelRef: string,
  currentHash: Sha256,
): IndexRowState {
  if (row.embeddingModel === modelRef && row.embeddingInputHash === currentHash) return 'indexed';
  if (row.embeddingModel !== null && row.embeddingModel !== modelRef) return 'stale';
  return 'pending';
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

/** Builds the current document of each row and compares it with what is stored. */
@Injectable()
export class EmbeddingDocumentPlanner {
  constructor(
    private readonly repository: EmbeddingIndexRepository,
    private readonly reader: ContentStoreTextReader,
  ) {}

  async plan(rows: readonly EmbeddingSourceRow[], modelRef: string): Promise<IndexPlan> {
    const nonBiometricIds = rows.filter((row) => row.sensitivity !== 'biometric').map((row) => row.id);
    const notesByRow = await this.repository.activeLearningNotes(nonBiometricIds);
    const planned: PlannedRow[] = [];
    const failed: UnplannableRow[] = [];
    for (const row of rows) {
      const ref = refOfRow(row);
      try {
        const document = await buildEmbeddingDocument(toEmbeddingSource(row, notesByRow.get(row.id) ?? []), this.reader);
        const inputHash = embeddingInputHash(modelRef, document);
        planned.push({ rowId: row.id, ref, document, inputHash, state: indexRowState(row, modelRef, inputHash), updatedAt: row.updatedAt });
      } catch (error) {
        failed.push({ rowId: row.id, ref, errorName: errorName(error) });
      }
    }
    return { planned, failed };
  }
}
