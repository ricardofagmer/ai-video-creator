import { z } from 'zod';
import { IsoDateTimeSchema, RunIdSchema, ScheduleIdSchema, UlidSchema } from '../common/ids';
import { SCHEDULE_FORMAT_VERSION } from './constants';
import { SlotMissedReasonSchema, SlotResultSchema, SlotSkippedReasonSchema } from './enums';

/**
 * `schedules/<scheduleId>/cursor.json` (SPEC 0006 section 4.3): how far slots were evaluated.
 * Watcher only, written after the slot lines of an evaluation, between runs.
 */
export const ScheduleCursorSchema = z
  .object({
    format: z.literal(SCHEDULE_FORMAT_VERSION),
    scheduleId: ScheduleIdSchema,
    evaluatedThrough: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type ScheduleCursor = z.infer<typeof ScheduleCursorSchema>;

/**
 * One line of `schedules/<scheduleId>/slots.jsonl` (SPEC 0006 section 4.3): the owner-visible
 * record of one decided slot. Watcher only, append-only, never rewritten. Rules: `reasonId` is null
 * exactly when `result` is `fired`, and is a missed reason for `missed` and a skipped reason for
 * `skipped`; `runId` and `briefId` are both set exactly when `result` is `fired`.
 */
export const SlotLineSchema = z
  .object({
    slotAt: IsoDateTimeSchema,
    decidedAt: IsoDateTimeSchema,
    result: SlotResultSchema,
    reasonId: z.union([SlotMissedReasonSchema, SlotSkippedReasonSchema]).nullable(),
    runId: RunIdSchema.nullable(),
    briefId: UlidSchema.nullable(),
  })
  .strict()
  .superRefine((line, context) => {
    const fired = line.result === 'fired';
    if (fired !== (line.reasonId === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: 'reasonId is null exactly when the slot fired' });
    }
    if (line.result === 'missed' && line.reasonId !== null && !SlotMissedReasonSchema.safeParse(line.reasonId).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: 'a missed slot needs a missed reason' });
    }
    if (line.result === 'skipped' && line.reasonId !== null && !SlotSkippedReasonSchema.safeParse(line.reasonId).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: 'a skipped slot needs a skipped reason' });
    }
    if (fired !== (line.runId !== null) || fired !== (line.briefId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runId'],
        message: 'runId and briefId are both set exactly when the slot fired',
      });
    }
  });
export type SlotLine = z.infer<typeof SlotLineSchema>;
