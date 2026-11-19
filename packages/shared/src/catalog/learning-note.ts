import { z } from 'zod';
import { IsoDateTimeSchema, LearningNoteIdSchema, RunIdSchema } from '../common/ids';
import { AssetRefSchema } from './asset-kind';

/** B17: note text cap and active notes per asset version. */
export const LEARNING_NOTE_MAX_CHARS = 500;
export const LEARNING_NOTES_MAX_ACTIVE_PER_VERSION = 20;

/**
 * A learning written back from a reviewed run onto an asset version (SPEC 0003 section 5.5, PRD 8
 * step 6). A row beside the immutable version: saving one creates no version and changes no
 * `contentHash`. The text is untrusted data everywhere: it is stored as typed, never parsed for
 * parameters, and rendered only inside delimited blocks or through escaping.
 */
export const LearningNoteSchema = z
  .object({
    noteId: LearningNoteIdSchema,
    ref: AssetRefSchema,
    text: z.string().min(1).max(LEARNING_NOTE_MAX_CHARS),
    sourceRunId: RunIdSchema,
    createdBy: z.string().min(1).max(100),
    createdAt: IsoDateTimeSchema,
    status: z.enum(['active', 'retired']),
    retiredAt: IsoDateTimeSchema.nullable(),
  })
  .strict();
export type LearningNote = z.infer<typeof LearningNoteSchema>;

/** C0 control characters and DEL/C1, except the whitespace ones the next step collapses. */
const nonWhitespaceControlCharacters = /(?![\t\n\v\f\r])\p{Cc}/gu;
const whitespaceRuns = /\s+/gu;

/**
 * The stored form of a note (section 5.5 step 4): NFC, control characters removed, whitespace runs
 * collapsed to one space, trimmed. Line breaks become spaces rather than being deleted, so words on
 * two lines stay two words. The caller then checks the 1..500 length.
 */
export function normalizeLearningText(text: string): string {
  return text.normalize('NFC').replace(nonWhitespaceControlCharacters, '').replace(whitespaceRuns, ' ').trim();
}
