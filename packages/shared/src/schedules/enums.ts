import { z } from 'zod';

/** Lifecycle of `schedule.json`. `deleted` is terminal: a status, the folder is never removed (B10). */
export const ScheduleStatusSchema = z.enum(['active', 'paused', 'deleted']);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

/**
 * Which brief a slot uses (Q5). The owner chose `queue`: one unused brief per fired slot, and an
 * empty queue skips the slot (`brief-queue-empty`). `repeat` stays in the file contract (section
 * 4.3) so readers need no change if the owner enables it later; `CreateScheduleRequestSchema`
 * accepts `CreatableBriefModeSchema` only.
 */
export const BriefModeSchema = z.enum(['queue', 'repeat']);
export type BriefMode = z.infer<typeof BriefModeSchema>;

/** The brief modes a new schedule may use (Q5 answer: queue only). */
export const CreatableBriefModeSchema = BriefModeSchema.extract(['queue']);
export type CreatableBriefMode = z.infer<typeof CreatableBriefModeSchema>;

/** How the watcher decided one slot (OD4): every slot is logged, none is replayed. */
export const SlotResultSchema = z.enum(['fired', 'missed', 'skipped']);
export type SlotResult = z.infer<typeof SlotResultSchema>;

/**
 * Why a slot was `missed` (B15, best effort): `watcher-busy` only when this process was executing a
 * run or curation at the slot instant; asleep, off and stopped all read `watcher-not-running`.
 */
export const SlotMissedReasonSchema = z.enum(['watcher-not-running', 'watcher-busy']);
export type SlotMissedReason = z.infer<typeof SlotMissedReasonSchema>;

/** Why a slot was `skipped`: the guard chain of section 5.6, in order, plus the two failure reasons. */
export const SlotSkippedReasonSchema = z.enum([
  'previous-run-open',
  'review-backlog',
  'brief-queue-empty',
  'month-spend-unavailable',
  'over-month-ceiling',
  'recipe-not-runnable',
  'bindings-unresolvable',
  'schedule-unreadable',
  'internal-error',
]);
export type SlotSkippedReason = z.infer<typeof SlotSkippedReasonSchema>;
