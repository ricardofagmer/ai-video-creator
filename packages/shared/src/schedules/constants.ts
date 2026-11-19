/*
 * Schedule protocol constants (SPEC 0006 section 4.2). Every string and bound the api, watcher,
 * web and CLI agree on for a schedule lives here and nowhere else.
 */

/** `<data home>/schedules/`: the one folder every schedule file lives under (section 4.6). */
export const SCHEDULES_FOLDER_NAME = 'schedules';

/** Version of the on-disk schedule files; a reader refuses a higher number (ADR 0003 decision 5). */
export const SCHEDULE_FORMAT_VERSION = 1;

/**
 * Files inside `schedules/<scheduleId>/`; no other name is ever read or written there.
 * `schedule.json` has the api or CLI as its writer; `cursor.json` and `slots.jsonl` the watcher.
 */
export const scheduleFileNames = {
  schedule: 'schedule.json',
  cursor: 'cursor.json',
  slots: 'slots.jsonl',
} as const;
export type ScheduleFileKey = keyof typeof scheduleFileNames;

/** Section 4.2 bounds. `lateGraceMs` is 2 hours (Q6). */
export const scheduleBounds = {
  maxSchedules: 10,
  maxBriefs: 50,
  lateGraceMs: 7_200_000,
  maxOpenReviews: 3,
  maxSlotsPerEvaluation: 400,
  slotsShown: 20,
  nextShown: 5,
  titleChars: 120,
} as const;
