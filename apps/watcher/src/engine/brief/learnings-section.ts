import { UNTRUSTED_TAG, wrapDelimited } from '@studio/shared/agents';
import { type AssetRef } from '@studio/shared/catalog';
import { type StageBrief } from '@studio/shared/run-format';
import { learningsTexts } from '../owner-texts';

/** C3 `StageBriefSchema.learnings`, as the brief step writes it (always present from R2 on). */
export type StageBriefLearnings = NonNullable<StageBrief['learnings']>;
export type StageBriefLearning = StageBriefLearnings[number];

/**
 * One note as one `<untrusted ref="..." note="...">` block (SPEC 0003 section 5.5 step 5). The
 * shared helper escapes every protocol tag inside the text, so a note can never close its block or
 * open another, and escapes the attribute values.
 */
export function renderLearningBlock(ref: AssetRef, note: { noteId: string; text: string }): string {
  return wrapDelimited(UNTRUSTED_TAG, note.text, { ref, note: note.noteId });
}

/** Header line of one ref's notes; `slot` and `ref` are recipe or run pins, never note text. */
export function renderLearningEntryHeader(entry: StageBriefLearning): string {
  return learningsTexts.entry(entry.slot ?? learningsTexts.runReference, entry.ref, entry.notes.length, entry.omitted);
}

/**
 * Body of the "Aprendizados do catálogo" section, shared by the stage brief and plan.md so both
 * show the same list: the fixed data notice, then per ref a header line and one delimited block
 * per note. The heading itself is added by the caller.
 */
export function renderLearningsBody(learnings: StageBriefLearnings): string[] {
  if (learnings.length === 0) return [learningsTexts.dataNotice, learningsTexts.none];
  return [
    learningsTexts.dataNotice,
    ...learnings.flatMap((entry) => [renderLearningEntryHeader(entry), ...entry.notes.map((note) => renderLearningBlock(entry.ref, note))]),
  ];
}
