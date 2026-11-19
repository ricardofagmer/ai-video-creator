import { z } from 'zod';
import { CorrelationIdSchema, IsoDateTimeSchema, ScheduleIdSchema, UlidSchema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { BriefSchema } from '../recipes/brief';
import { RecipeRefSchema } from '../recipes/recipe';
import { SCHEDULE_FORMAT_VERSION, scheduleBounds } from './constants';
import { BriefModeSchema, ScheduleStatusSchema } from './enums';
import { IanaTimeZoneSchema, RecurrenceSchema } from './recurrence';

/**
 * One brief of a schedule's queue (SPEC 0006 section 4.3). Owner text, stored in `schedule.json`
 * (mode 0600) and copied into the fired `run.json` as today; it stays untrusted data for agents.
 * `briefId` is server-generated and recorded on the `fired` slot line that used it.
 */
export const ScheduleBriefSchema = z
  .object({
    briefId: UlidSchema,
    brief: BriefSchema,
    references: z.array(AssetRefSchema).max(50),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type ScheduleBrief = z.infer<typeof ScheduleBriefSchema>;

/**
 * `schedules/<scheduleId>/schedule.json` (SPEC 0006 sections 4.3 and 4.6). Writers: the api or the
 * CLI only (create, pause, resume, delete, add or remove briefs), each an atomic rewrite; the
 * watcher only reads it. `recipeRef` is pinned `id@version` (B6). `costConsent.perRunUsd` is the
 * per-run ceiling the owner accepted at creation. Rule: `briefId`s are unique.
 */
export const ScheduleFileSchema = z
  .object({
    format: z.literal(SCHEDULE_FORMAT_VERSION),
    scheduleId: ScheduleIdSchema,
    title: z.string().trim().min(1).max(scheduleBounds.titleChars),
    status: ScheduleStatusSchema,
    /** Resuming sets it to now, so no slot from the paused period is ever evaluated. */
    statusSince: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    createdBy: z.enum(['api', 'cli']),
    correlationId: CorrelationIdSchema.nullable(),
    recipeRef: RecipeRefSchema,
    recurrence: RecurrenceSchema,
    timezone: IanaTimeZoneSchema,
    briefMode: BriefModeSchema,
    briefs: z.array(ScheduleBriefSchema).min(1).max(scheduleBounds.maxBriefs),
    costConsent: z
      .object({
        perRunUsd: z.number().nonnegative(),
        acceptedAt: IsoDateTimeSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((schedule, context) => {
    const seen = new Set<string>();
    schedule.briefs.forEach((brief, index) => {
      if (seen.has(brief.briefId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['briefs', index, 'briefId'], message: 'briefId is repeated' });
      }
      seen.add(brief.briefId);
    });
  });
export type ScheduleFile = z.infer<typeof ScheduleFileSchema>;
