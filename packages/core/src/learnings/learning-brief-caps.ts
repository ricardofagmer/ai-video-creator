import { type AssetRef, type LearningNote } from '@studio/shared/catalog';
import { STAGE_BRIEF_LEARNINGS_MAX_CHARS } from '@studio/shared/run-format';

/** B18: at most 10 notes per ref in one brief (C3 `StageBriefSchema.learnings[].notes`). */
export const BRIEF_LEARNINGS_MAX_NOTES_PER_REF = 10;

export interface BriefNote {
  noteId: string;
  text: string;
  sourceRunId: string;
}

/** One ref's share of a brief, without the `slot`, which only the brief renderer knows. */
export interface BriefRefLearnings {
  ref: AssetRef;
  notes: BriefNote[];
  /** Notes left out by the per-ref or the per-brief cap. */
  omitted: number;
}

/**
 * B18 caps, pure: per ref the newest 10 notes; across the brief at most
 * `STAGE_BRIEF_LEARNINGS_MAX_CHARS` (4,000) characters of note text. Refs are filled in the order
 * given and notes newest first; once a note does not fit the budget, it and every later note are
 * counted in `omitted`, so what a brief keeps is always a prefix and never depends on note length.
 */
export function capLearningsForBrief(entries: readonly { ref: AssetRef; notes: readonly LearningNote[] }[]): BriefRefLearnings[] {
  let remainingChars = STAGE_BRIEF_LEARNINGS_MAX_CHARS;
  let budgetSpent = false;
  return entries.map((entry) => {
    const kept: BriefNote[] = [];
    for (const note of entry.notes) {
      if (budgetSpent || kept.length >= BRIEF_LEARNINGS_MAX_NOTES_PER_REF) continue;
      if (note.text.length > remainingChars) {
        budgetSpent = true;
        continue;
      }
      remainingChars -= note.text.length;
      kept.push({ noteId: note.noteId, text: note.text, sourceRunId: note.sourceRunId });
    }
    return { ref: entry.ref, notes: kept, omitted: entry.notes.length - kept.length };
  });
}
