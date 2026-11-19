import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type ParsedAssetRef } from '@studio/shared/catalog';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { learningNoteProjection, type LearningNoteRow } from './learning-note.mapper';

export interface NewLearningNote {
  noteId: string;
  assetVersionRowId: number;
  text: string;
  sourceRunId: string;
  createdBy: string;
  createdAt: Date;
}

function versionsWhere(versions: readonly ParsedAssetRef[]): Prisma.AssetVersionWhereInput {
  return { OR: versions.map((key) => ({ assetId: key.assetId, version: key.version })) };
}

/**
 * Data access for `asset_learning_notes` (SPEC 0003 section 4.4). Writes are an insert and a
 * one-way retire; there is no delete, and the database triggers refuse any other change. Every
 * read uses `learningNoteProjection`. Handlers own transactions.
 */
@Injectable()
export class LearningNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(note: NewLearningNote, db: PrismaTransaction): Promise<LearningNoteRow> {
    return db.assetLearningNote.create({
      data: {
        id: note.noteId,
        assetVersionId: note.assetVersionRowId,
        text: note.text,
        sourceRunId: note.sourceRunId,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
        status: 'active',
      },
      ...learningNoteProjection,
    });
  }

  async countActive(assetVersionRowId: number, db: PrismaTransaction): Promise<number> {
    return db.assetLearningNote.count({ where: { assetVersionId: assetVersionRowId, status: 'active' } });
  }

  async findById(noteId: string, db: PrismaTransaction = this.prisma): Promise<LearningNoteRow | null> {
    return db.assetLearningNote.findUnique({ where: { id: noteId }, ...learningNoteProjection });
  }

  /** Active to retired, once: a note already retired is not matched, so the count is 0. */
  async retire(noteId: string, retiredAt: Date, db: PrismaTransaction): Promise<number> {
    const result = await db.assetLearningNote.updateMany({ where: { id: noteId, status: 'active' }, data: { status: 'retired', retiredAt } });
    return result.count;
  }

  /** One version's notes, active and retired, newest first (the view's `learnings`, max `limit`). */
  async listForVersion(version: ParsedAssetRef, limit: number): Promise<LearningNoteRow[]> {
    return this.prisma.assetLearningNote.findMany({
      where: { assetVersion: { assetId: version.assetId, version: version.version } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...learningNoteProjection,
    });
  }

  /**
   * B18 cutoff rule: notes created at or before `cutoff` and not retired at or before it, newest
   * first. Biometric versions are excluded here as well as at save time (B17). Read-only.
   */
  async listVisibleAt(versions: readonly ParsedAssetRef[], cutoff: Date, limit: number): Promise<LearningNoteRow[]> {
    if (versions.length === 0) return [];
    return this.prisma.assetLearningNote.findMany({
      where: {
        assetVersion: { ...versionsWhere(versions), sensitivity: { not: 'biometric' } },
        createdAt: { lte: cutoff },
        OR: [{ retiredAt: null }, { retiredAt: { gt: cutoff } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...learningNoteProjection,
    });
  }
}
