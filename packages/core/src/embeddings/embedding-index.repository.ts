import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { LEARNING_NOTES_MAX_ACTIVE_PER_VERSION, type AssetKind, type AssetStatus, type ParsedAssetRef } from '@studio/shared/catalog';
import { versionReadProjection, type AssetVersionRow } from '../catalog/asset-version.mapper';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What the indexer reads to build a document. It never selects `reference_path` (R2-AC-08) nor
 * `embedding_json`; `updatedAt` is read only to write it back unchanged, so indexing never makes
 * a version look edited.
 */
const sourceSelect = {
  id: true,
  assetId: true,
  version: true,
  name: true,
  summary: true,
  tagsJson: true,
  notes: true,
  sensitivity: true,
  storageMode: true,
  contentHash: true,
  detailsJson: true,
  updatedAt: true,
  embeddingModel: true,
  embeddingInputHash: true,
  asset: { select: { kind: true } },
} satisfies Prisma.AssetVersionSelect;
export type EmbeddingSourceRow = Prisma.AssetVersionGetPayload<{ select: typeof sourceSelect }>;

/**
 * The search scan projection (SPEC 0003 section 5.2 query flow step 3), without the vector: the
 * vector text is loaded separately, only for rows whose parsed vector is not cached.
 */
const vectorKeySelect = {
  id: true,
  embeddingModel: true,
  embeddingInputHash: true,
} satisfies Prisma.AssetVersionSelect;
export type VectorKeyRow = Prisma.AssetVersionGetPayload<{ select: typeof vectorKeySelect }>;

export interface StoredVectorText {
  rowId: number;
  inputHash: string | null;
  vectorJson: string | null;
}

export interface VectorScanFilter {
  kinds: readonly AssetKind[] | null;
  statuses: readonly AssetStatus[] | null;
  excludeBiometric: boolean;
}

export interface EmbeddingWrite {
  rowId: number;
  vectorJson: string;
  modelRef: string;
  inputHash: string;
  embeddedAt: Date;
  /** Written back as read, so `@updatedAt` does not move. */
  updatedAt: Date;
}

/** Refs looked up in one call; callers pass the refs of one save or one note. */
export const MAX_REFS_PER_LOOKUP = 100;

function scanWhere(filter: VectorScanFilter): Prisma.AssetVersionWhereInput {
  const conditions: Prisma.AssetVersionWhereInput[] = [];
  if (filter.statuses !== null) conditions.push({ status: { in: [...filter.statuses] } });
  if (filter.kinds !== null) conditions.push({ asset: { kind: { in: [...filter.kinds] } } });
  // The same default as lexical search: biometric rows are excluded unless `sensitivity: 'any'`.
  if (filter.excludeBiometric) conditions.push({ sensitivity: { not: 'biometric' } });
  return { AND: conditions };
}

/**
 * Data access of the embeddings module; every filter is a Prisma binding, no SQL text is built.
 * The single writer of `embedding_json`, `embedding_model`, `embedding_input_hash` and
 * `embedded_at` (ADR 0003 single-writer rule: provided to the api and the CLI only).
 */
@Injectable()
export class EmbeddingIndexRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Keyset page over every version by row id, ascending. */
  async pageSources(afterRowId: number, take: number): Promise<EmbeddingSourceRow[]> {
    return this.prisma.assetVersion.findMany({ where: { id: { gt: afterRowId } }, orderBy: { id: 'asc' }, take, select: sourceSelect });
  }

  async findSourcesByRefs(refs: readonly ParsedAssetRef[]): Promise<EmbeddingSourceRow[]> {
    if (refs.length === 0) return [];
    const wanted = refs.slice(0, MAX_REFS_PER_LOOKUP).map((ref) => ({ assetId: ref.assetId, version: ref.version }));
    return this.prisma.assetVersion.findMany({ where: { OR: wanted }, orderBy: { id: 'asc' }, select: sourceSelect });
  }

  /**
   * Active learning notes per row, newest first (document item 4). The join excludes biometric
   * rows, so their notes are never read even if one existed.
   */
  async activeLearningNotes(rowIds: readonly number[]): Promise<Map<number, string[]>> {
    const notesByRow = new Map<number, string[]>();
    if (rowIds.length === 0) return notesByRow;
    const notes = await this.prisma.assetLearningNote.findMany({
      where: { assetVersionId: { in: [...rowIds] }, status: 'active', assetVersion: { sensitivity: { not: 'biometric' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: rowIds.length * LEARNING_NOTES_MAX_ACTIVE_PER_VERSION,
      select: { assetVersionId: true, text: true },
    });
    for (const note of notes) {
      const texts = notesByRow.get(note.assetVersionId) ?? [];
      texts.push(note.text);
      notesByRow.set(note.assetVersionId, texts);
    }
    return notesByRow;
  }

  /** Writes the four embedding columns of one row and nothing else. */
  async writeEmbedding(write: EmbeddingWrite): Promise<void> {
    await this.prisma.assetVersion.update({
      where: { id: write.rowId },
      data: {
        embeddingJson: write.vectorJson,
        embeddingModel: write.modelRef,
        embeddingInputHash: write.inputHash,
        embeddedAt: write.embeddedAt,
        updatedAt: write.updatedAt,
      },
      select: { id: true },
    });
  }

  /** Keyset page of the search scan; filters match lexical search (kinds, statuses, biometric). */
  async pageVectorKeys(filter: VectorScanFilter, afterRowId: number, take: number): Promise<VectorKeyRow[]> {
    return this.prisma.assetVersion.findMany({
      where: { AND: [scanWhere(filter), { id: { gt: afterRowId } }] },
      orderBy: { id: 'asc' },
      take,
      select: vectorKeySelect,
    });
  }

  /** The only read of `embedding_json` in the codebase; its result never leaves this module. */
  async findVectorTexts(rowIds: readonly number[]): Promise<StoredVectorText[]> {
    if (rowIds.length === 0) return [];
    const rows = await this.prisma.assetVersion.findMany({
      where: { id: { in: [...rowIds] } },
      select: { id: true, embeddingInputHash: true, embeddingJson: true },
    });
    return rows.map((row) => ({ rowId: row.id, inputHash: row.embeddingInputHash, vectorJson: row.embeddingJson }));
  }

  /** The result rows, in the default read projection that never loads the vector (L8). */
  async findVersionsByRowIds(rowIds: readonly number[]): Promise<AssetVersionRow[]> {
    if (rowIds.length === 0) return [];
    return this.prisma.assetVersion.findMany({ where: { id: { in: [...rowIds] } }, ...versionReadProjection });
  }
}
