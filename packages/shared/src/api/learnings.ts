import { z } from 'zod';
import { LearningNoteIdSchema } from '../common/ids';
import { AssetIdSchema, AssetRefSchema } from '../catalog/asset-kind';
import { LEARNING_NOTE_MAX_CHARS, LearningNoteSchema } from '../catalog/learning-note';
import { queryInteger } from './common';

/** Rev 3 (SPEC 0003 section 4.3): a learning note as the api returns it is the C1 `LearningNote`. */
export const LearningNoteViewSchema = LearningNoteSchema;
export type LearningNoteView = z.infer<typeof LearningNoteViewSchema>;

/**
 * `POST /runs/:runId/learnings` body (section 5.5). The api normalizes the text with
 * `normalizeLearningText` and checks the 1..500 length again after normalization; `createdBy` and
 * `sourceRunId` come from the session and the path. Refusals: 409 `learning-run-not-reviewed`;
 * 422 `learning-ref-not-used`, `learning-biometric-refused`, `learning-contains-secret`,
 * `learning-limit-reached`.
 */
export const SaveLearningRequestSchema = z
  .object({
    ref: AssetRefSchema,
    text: z.string().min(1).max(LEARNING_NOTE_MAX_CHARS),
  })
  .strict();
export type SaveLearningRequest = z.infer<typeof SaveLearningRequestSchema>;

/** `PUT /catalog/assets/:assetId/versions/:version/learnings/:noteId/status` body; nothing is deleted. */
export const RetireLearningRequestSchema = z.object({ status: z.literal('retired') }).strict();
export type RetireLearningRequest = z.infer<typeof RetireLearningRequestSchema>;

/** Path params of the retire route: a note is retired only through the version it belongs to. */
export const LearningNoteParamsSchema = z
  .object({ assetId: AssetIdSchema, version: queryInteger(1, 1_000_000), noteId: LearningNoteIdSchema })
  .strict();
