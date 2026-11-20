import { z } from 'zod';
import { AssetRefSchema } from '@studio/shared/catalog';
import { BriefSchema, RecipeRefSchema } from '@studio/shared/recipes';
import { CorrelationIdSchema, RunCreatedBySchema, RunScheduleLinkSchema } from '@studio/shared/run-format';
import { type InputIssue } from '../catalog';
import { InvalidRunInputError } from './runs.errors';

/** Boundary schema of a new draft run (PRD 6 steps 1-2: a recipe version, the brief, references). */
export const CreateRunDraftInputSchema = z
  .object({
    recipeRef: RecipeRefSchema,
    brief: BriefSchema,
    /** Run-specific references attached to the brief (C3 `references`, at most 50, no repeats). */
    references: z
      .array(AssetRefSchema)
      .max(50)
      .refine((refs) => new Set(refs).size === refs.length, { message: 'a reference is attached at most once' })
      .default([]),
    /** Defaults to the brief topic, cut to the C3 title limit. */
    title: z.string().trim().min(1).max(200).optional(),
    /** C3 `RunCreatedBySchema`; `watcher` only with `schedule` (SPEC 0006 section 4.3). */
    createdBy: RunCreatedBySchema,
    /** The api's `x-request-id`; null from the CLI and the watcher (RUN-FORMAT section 5). */
    correlationId: CorrelationIdSchema.nullable().default(null),
    /** The due slot a watcher-created run comes from; present exactly when `createdBy` is `watcher`. */
    schedule: RunScheduleLinkSchema.optional(),
  })
  .strict()
  .superRefine((fields, context) => {
    if ((fields.createdBy === 'watcher') !== (fields.schedule !== undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['schedule'], message: 'schedule is present exactly when createdBy is watcher' });
    }
  });
export type CreateRunDraftInput = z.input<typeof CreateRunDraftInputSchema>;
export type CreateRunDraftFields = z.output<typeof CreateRunDraftInputSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseRunInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidRunInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}
