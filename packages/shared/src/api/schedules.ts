import { z } from 'zod';
import { IsoDateTimeSchema, ScheduleIdSchema, UlidSchema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { BriefSchema } from '../recipes/brief';
import { RecipeRefSchema } from '../recipes/recipe';
import { scheduleBounds } from '../schedules/constants';
import { CreatableBriefModeSchema } from '../schedules/enums';
import { IanaTimeZoneSchema, RecurrenceSchema } from '../schedules/recurrence';
import { ScheduleBriefSchema, ScheduleFileSchema } from '../schedules/schedule-file';
import { SlotLineSchema } from '../schedules/slot-log';

/*
 * C10 rev 5 schedule routes (SPEC 0006 sections 4.4, 5.5 and 5.7). `createdBy`, timestamps and
 * `correlationId` come from the session, the server clock and `x-request-id`. No route writes
 * `cursor.json` or `slots.jsonl`, and no route sets a run status.
 */

export const ScheduleParamsSchema = z.object({ scheduleId: ScheduleIdSchema }).strict();
export type ScheduleParams = z.infer<typeof ScheduleParamsSchema>;

/** A brief as the owner submits it; the api assigns `briefId`. */
export const ScheduleBriefInputSchema = ScheduleBriefSchema.omit({ briefId: true });
export type ScheduleBriefInput = z.infer<typeof ScheduleBriefInputSchema>;

/**
 * `POST /schedules` (201 `ScheduleView`). Refusals in order: 422 `schedule-time-invalid` (zone or
 * a `once` slot not in the future), 422 `schedule-limit-reached` (10 not `deleted`), 422
 * `schedule-recipe-not-runnable`, 409 `schedule-estimate-changed` when
 * `acceptedWorstCasePerRunUsd` differs from the pinned recipe's resolved `costPerRunUsd` by a cent
 * or more. `briefMode` is `queue` only (Q5).
 */
export const CreateScheduleRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(scheduleBounds.titleChars),
    recipeRef: RecipeRefSchema,
    recurrence: RecurrenceSchema,
    timezone: IanaTimeZoneSchema,
    briefMode: CreatableBriefModeSchema,
    briefs: z.array(ScheduleBriefInputSchema).min(1).max(scheduleBounds.maxBriefs),
    acceptedWorstCasePerRunUsd: z.number().nonnegative(),
  })
  .strict();
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

/**
 * `PATCH /schedules/:scheduleId`: one atomic rewrite of `schedule.json`. A `deleted` schedule
 * answers 409 `schedule-not-editable`. A brief already used by a `fired` slot cannot be removed.
 */
export const PatchScheduleRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
  z.object({ action: z.literal('delete') }).strict(),
  z
    .object({
      action: z.literal('add-briefs'),
      briefs: z.array(ScheduleBriefInputSchema).min(1).max(scheduleBounds.maxBriefs),
    })
    .strict(),
  z.object({ action: z.literal('remove-brief'), briefId: UlidSchema }).strict(),
]);
export type PatchScheduleRequest = z.infer<typeof PatchScheduleRequestSchema>;

/**
 * One brief as shown. `brief` and `references` are null in the list route (ids and titles only);
 * `used` is true once a `fired` slot line names the brief.
 */
export const ScheduleBriefViewSchema = z
  .object({
    briefId: UlidSchema,
    title: z.string().max(200).nullable(),
    used: z.boolean(),
    brief: BriefSchema.nullable(),
    references: z.array(AssetRefSchema).max(50).nullable(),
  })
  .strict();
export type ScheduleBriefView = z.infer<typeof ScheduleBriefViewSchema>;

/**
 * `GET /schedules/:scheduleId` and every schedule answer; `GET /schedules` returns an array of
 * these. The `schedule.json` fields with `briefs` replaced by their view, plus `next` (max 5, empty
 * unless `active`), `slots` (newest 20), `missedLast7Days`, `briefsRemaining` (null in `repeat`
 * mode) and `worstCasePerMonthUsd` (slots in the next 31 days times the per-run consent).
 */
export const ScheduleViewSchema = ScheduleFileSchema.innerType()
  .omit({ briefs: true })
  .extend({
    briefs: z.array(ScheduleBriefViewSchema).min(1).max(scheduleBounds.maxBriefs),
    next: z.array(IsoDateTimeSchema).max(scheduleBounds.nextShown),
    slots: z.array(SlotLineSchema).max(scheduleBounds.slotsShown),
    missedLast7Days: z.number().int().nonnegative(),
    briefsRemaining: z.number().int().nonnegative().nullable(),
    worstCasePerMonthUsd: z.number().nonnegative(),
  })
  .strict();
export type ScheduleView = z.infer<typeof ScheduleViewSchema>;

/** `GET /schedules` (200): never a `deleted` schedule. */
export const ScheduleListViewSchema = z.array(ScheduleViewSchema).max(scheduleBounds.maxSchedules);
export type ScheduleListView = z.infer<typeof ScheduleListViewSchema>;
