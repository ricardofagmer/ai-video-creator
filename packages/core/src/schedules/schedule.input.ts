import { z } from 'zod';
import { CreateScheduleRequestSchema, PatchScheduleRequestSchema } from '@studio/shared/api';
import { CorrelationIdSchema } from '@studio/shared/run-format';
import { ScheduleFileSchema, ScheduleIdSchema } from '@studio/shared/schedules';
import { type InputIssue } from '../catalog';
import { InvalidScheduleInputError, ScheduleTimeInvalidError } from './schedules.errors';

function refuseRepeatedReferences(briefs: readonly { references: readonly string[] }[], context: z.RefinementCtx): void {
  briefs.forEach((brief, index) => {
    if (new Set(brief.references).size !== brief.references.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['request', 'briefs', index, 'references'], message: 'a reference is attached at most once' });
    }
  });
}

/** `schedule.json` `createdBy`: only the api and the CLI write a schedule (SPEC 0006 K2). */
const ScheduleWriterSchema = ScheduleFileSchema.innerType().shape.createdBy;

/**
 * `POST /schedules` as core takes it: the C10 request plus who asked and the `x-request-id` the api
 * sets (null from the CLI), never body fields (SPEC 0006 section 4.4). A reference repeated inside
 * one brief is refused, as `CreateRunDraftInputSchema` refuses it for a manual run.
 */
export const CreateScheduleInputSchema = z
  .object({
    request: CreateScheduleRequestSchema,
    createdBy: ScheduleWriterSchema,
    correlationId: CorrelationIdSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => refuseRepeatedReferences(input.request.briefs, context));
export type CreateScheduleInput = z.input<typeof CreateScheduleInputSchema>;
export type CreateScheduleFields = z.output<typeof CreateScheduleInputSchema>;

/** `PATCH /schedules/:scheduleId` as core takes it; one atomic rewrite of `schedule.json`. */
export const PatchScheduleInputSchema = z
  .object({
    scheduleId: ScheduleIdSchema,
    request: PatchScheduleRequestSchema,
    correlationId: CorrelationIdSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.request.action === 'add-briefs') refuseRepeatedReferences(input.request.briefs, context);
  });
export type PatchScheduleInput = z.input<typeof PatchScheduleInputSchema>;
export type PatchScheduleFields = z.output<typeof PatchScheduleInputSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseScheduleInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidScheduleInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}

function touches(issue: z.ZodIssue, field: 'timezone' | 'recurrence'): boolean {
  return issue.path[0] === 'request' && issue.path[1] === field;
}

/**
 * The create input, with the C10 refusal for time problems: an unknown zone or a malformed
 * recurrence answers 422 `schedule-time-invalid` (contract `CreateScheduleRequestSchema`), any other
 * problem `invalid-schedule-input`, so the CLI and the api refuse the same way.
 */
export function parseCreateScheduleInput(input: unknown): CreateScheduleFields {
  const parsed = CreateScheduleInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (parsed.error.issues.some((issue) => touches(issue, 'timezone'))) throw new ScheduleTimeInvalidError('timezone');
  if (parsed.error.issues.some((issue) => touches(issue, 'recurrence'))) throw new ScheduleTimeInvalidError('recurrence');
  throw new InvalidScheduleInputError(issuesOf(parsed.error, ''));
}
