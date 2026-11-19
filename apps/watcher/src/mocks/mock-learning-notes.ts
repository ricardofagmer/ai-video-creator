import { Injectable } from '@nestjs/common';
import { type AssetRef, type LearningNote } from '@studio/shared/catalog';
import { type LearningNotesPort } from '@studio/shared/ports';

/**
 * Mock C6 `LearningNotesPort` for the offline fixture (`mock` selection): the in-memory fixture
 * catalog carries no learning notes, so every ref answers with an empty list. Named explicitly in
 * `src/watcher-ports.module.ts`, so a note-less brief is never a silent default of the real catalog.
 */
@Injectable()
export class MockLearningNotes implements LearningNotesPort {
  // The cutoff is irrelevant when no note exists, so the second parameter is not declared.
  async activeNotesFor(refs: readonly AssetRef[]): Promise<readonly { ref: AssetRef; notes: readonly LearningNote[] }[]> {
    return [...new Set(refs)].map((ref) => ({ ref, notes: [] }));
  }
}
