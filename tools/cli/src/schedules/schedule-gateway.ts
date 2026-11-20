import type { ScheduleListView, ScheduleView } from '@studio/shared/api';
import type { ScheduleId } from '@studio/shared/schedules';

/** The changes the CLI offers on a schedule (SPEC 0006 section 5.7); briefs change in the web. */
export type ScheduleChange = 'pause' | 'resume' | 'delete';

/**
 * What the schedule commands, `studio status` and their tests need from core. The production
 * adapter (`nest-schedule-gateway.ts`) boots the core `SchedulesModule` handlers, the only writer
 * of `schedule.json` besides the api (ADR 0003, SPEC 0006 K2); the CLI never writes a schedule
 * file itself, and never `cursor.json` or `slots.jsonl`.
 */
export interface ScheduleGateway {
  /** Every schedule that is not `deleted`, oldest first. */
  list(): Promise<ScheduleListView>;
  show(scheduleId: ScheduleId): Promise<ScheduleView>;
  change(scheduleId: ScheduleId, change: ScheduleChange): Promise<ScheduleView>;
}
