import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AssetRefSchema,
  IsoDateTimeSchema,
  LEARNING_NOTES_MAX_ACTIVE_PER_VERSION,
  parseAssetRef,
  type AssetRef,
  type IsoDateTime,
  type LearningNote,
} from '@studio/shared/catalog';
import { type LearningNotesPort } from '@studio/shared/ports';
import { parseLearningInput } from './learning-input';
import { toLearningNote } from './learning-note.mapper';
import { LearningNoteRepository } from './learning-note.repository';

/** A stage brief names at most 64 bindings and 50 references (C3); a little headroom, still bounded. */
export const MAX_LEARNING_REFS_PER_READ = 128;

/** `AssetVersionView.learnings` holds at most 50 notes (C10). */
export const MAX_LEARNINGS_PER_VERSION_VIEW = 50;

const VisibleNotesRequestSchema = z
  .object({ refs: z.array(AssetRefSchema).max(MAX_LEARNING_REFS_PER_READ), cutoff: IsoDateTimeSchema })
  .strict();

export interface RefLearningNotes {
  ref: AssetRef;
  notes: readonly LearningNote[];
}

/**
 * Read-only access to learning notes: the core implementation of C6 `LearningNotesPort` that the
 * watcher binds for its `brief` step (R2-07), and the per-version list behind the api views. It
 * never writes: the repository methods it calls are `findMany` reads only.
 */
@Injectable()
export class LearningNotesReader implements LearningNotesPort {
  constructor(private readonly notes: LearningNoteRepository) {}

  /**
   * B18: the notes each ref had at `cutoff`, newest first, one entry per distinct ref in the order
   * given (an entry with no notes included). The per-ref and per-brief caps are the caller's
   * (`capLearningsForBrief`), so it can count what it leaves out.
   */
  async activeNotesFor(refs: readonly AssetRef[], cutoff: IsoDateTime): Promise<readonly RefLearningNotes[]> {
    const request = parseLearningInput(VisibleNotesRequestSchema, { refs: [...refs], cutoff });
    const distinct = [...new Set(request.refs)];
    // Notes visible at one instant are notes active at that instant: at most 20 per version (B17).
    const limit = distinct.length * LEARNING_NOTES_MAX_ACTIVE_PER_VERSION;
    const rows = await this.notes.listVisibleAt(distinct.map(parseAssetRef), new Date(request.cutoff), limit);
    const byRef = new Map<AssetRef, LearningNote[]>(distinct.map((ref) => [ref, []]));
    for (const row of rows) {
      const note = toLearningNote(row);
      byRef.get(note.ref)?.push(note);
    }
    return distinct.map((ref) => ({ ref, notes: byRef.get(ref) ?? [] }));
  }

  /** One version's notes, active and retired, newest first, at most 50 (C10 `learnings`). */
  async notesOfVersion(ref: AssetRef): Promise<LearningNote[]> {
    const parsed = parseLearningInput(AssetRefSchema, ref);
    const rows = await this.notes.listForVersion(parseAssetRef(parsed), MAX_LEARNINGS_PER_VERSION_VIEW);
    return rows.map(toLearningNote);
  }
}
