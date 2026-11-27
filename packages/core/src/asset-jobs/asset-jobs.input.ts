import { z } from 'zod';
import { AssetIdSchema } from '@studio/shared/catalog';
import { LanguageSchema } from '@studio/shared/recipes';
import { type InputIssue } from '../catalog';
import { InvalidAssetJobInputError } from './asset-jobs.errors';

/** The `:assetId/versions/:version` of every asset job route, as core takes it. */
export const AssetJobTargetSchema = z
  .object({
    assetId: AssetIdSchema,
    version: z.number().int().min(1),
  })
  .strict();
export type AssetJobTarget = z.input<typeof AssetJobTargetSchema>;

/**
 * `POST .../voice-sample`. The sentence is picked from `VOICE_SAMPLE_TEXT` by `language`; no
 * request field can carry text to speak.
 */
export const RequestVoiceSampleInputSchema = AssetJobTargetSchema.extend({
  language: LanguageSchema,
  replace: z.boolean().optional(),
}).strict();
export type RequestVoiceSampleInput = z.input<typeof RequestVoiceSampleInputSchema>;

function issuesOf(error: z.ZodError): InputIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseAssetJobInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidAssetJobInputError(issuesOf(parsed.error));
  return parsed.data;
}

