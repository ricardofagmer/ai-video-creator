import { nextSlots, scheduleBounds, type ScheduleBrief, type ScheduleFile, type SlotSchedule } from '@studio/shared/schedules';
import { ScheduleBriefChangeRefusedError, ScheduleNotEditableError } from './schedules.errors';

/*
 * Pure rules of the schedule writes (SPEC 0006 section 5.5). The handlers read, call these, and
 * write the answer; nothing here touches a file.
 */

/** One PATCH action with server-assigned brief ids already in place. */
export type ScheduleAction =
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'delete' }
  | { action: 'add-briefs'; briefs: readonly ScheduleBrief[] }
  | { action: 'remove-brief'; briefId: string };

/** The section 7 event a change logs. */
export type ScheduleChangeEvent = 'schedule.paused' | 'schedule.resumed' | 'schedule.deleted' | 'schedule.briefs-changed';

/** `unchanged`: the action is already in effect (pause a paused schedule), so nothing is written. */
export type ScheduleChange = { kind: 'unchanged' } | { kind: 'changed'; file: ScheduleFile; event: ScheduleChangeEvent };

export interface ScheduleChangeRequest {
  file: ScheduleFile;
  action: ScheduleAction;
  /** `briefId`s named by `fired` slot lines: such a brief cannot be removed. */
  usedBriefIds: ReadonlySet<string>;
  now: Date;
}

function toCents(usd: number): number {
  return Math.round(usd * 100);
}

/** Step 4: the consent equals the recipe's resolved `costPerRunUsd` to the cent. */
export function consentMatches(acceptedUsd: number, costPerRunUsd: number): boolean {
  return Number.isFinite(acceptedUsd) && Number.isFinite(costPerRunUsd) && toCents(acceptedUsd) === toCents(costPerRunUsd);
}

/** Step 5: at least one slot lies after `now`; only a `once` recurrence in the past has none. */
export function hasFutureSlot(schedule: SlotSchedule, now: Date): boolean {
  return nextSlots({ ...schedule, after: now, count: 1 }).length > 0;
}

function withStatus(file: ScheduleFile, status: ScheduleFile['status'], now: string): ScheduleFile {
  // Resuming sets `statusSince` to now, so no slot of the paused period is ever evaluated (R3-AC-20).
  return { ...file, status, statusSince: now, updatedAt: now };
}

function addBriefs(file: ScheduleFile, briefs: readonly ScheduleBrief[], now: string): ScheduleFile {
  if (file.briefs.length + briefs.length > scheduleBounds.maxBriefs) {
    throw new ScheduleBriefChangeRefusedError(file.scheduleId, 'too-many-briefs');
  }
  return { ...file, briefs: [...file.briefs, ...briefs], updatedAt: now };
}

function removeBrief(request: ScheduleChangeRequest, briefId: string, now: string): ScheduleFile {
  const { file } = request;
  if (!file.briefs.some((brief) => brief.briefId === briefId)) throw new ScheduleBriefChangeRefusedError(file.scheduleId, 'brief-not-found');
  if (request.usedBriefIds.has(briefId)) throw new ScheduleBriefChangeRefusedError(file.scheduleId, 'brief-used');
  if (file.briefs.length <= 1) throw new ScheduleBriefChangeRefusedError(file.scheduleId, 'last-brief');
  return { ...file, briefs: file.briefs.filter((brief) => brief.briefId !== briefId), updatedAt: now };
}

/**
 * Pause, resume, delete, add or remove briefs. `deleted` is final: every action on it refuses
 * (409 `schedule-not-editable`). Only `active` and `paused` are ever written here besides `deleted`.
 */
export function changeSchedule(request: ScheduleChangeRequest): ScheduleChange {
  const { file, action } = request;
  if (file.status === 'deleted') throw new ScheduleNotEditableError(file.scheduleId);
  const now = request.now.toISOString();
  switch (action.action) {
    case 'pause':
      return file.status === 'paused' ? { kind: 'unchanged' } : { kind: 'changed', file: withStatus(file, 'paused', now), event: 'schedule.paused' };
    case 'resume':
      return file.status === 'active' ? { kind: 'unchanged' } : { kind: 'changed', file: withStatus(file, 'active', now), event: 'schedule.resumed' };
    case 'delete':
      return { kind: 'changed', file: withStatus(file, 'deleted', now), event: 'schedule.deleted' };
    case 'add-briefs':
      return { kind: 'changed', file: addBriefs(file, action.briefs, now), event: 'schedule.briefs-changed' };
    case 'remove-brief':
      return { kind: 'changed', file: removeBrief(request, action.briefId, now), event: 'schedule.briefs-changed' };
  }
}
