/*
 * Schedule protocol constants (SPEC 0006 section 4.2). Every string and bound the api, watcher,
 * web and CLI agree on for a schedule lives here and nowhere else.
 */

/** `<data home>/schedules/`: the one folder every schedule file lives under (section 4.6). */
export const SCHEDULES_FOLDER_NAME = 'schedules';

/** Version of the on-disk schedule files; a reader refuses a higher number (ADR 0003 decision 5). */
export const SCHEDULE_FORMAT_VERSION = 1;

/**
 * Files inside `schedules/<scheduleId>/`; besides the `fired/` claims folder below, no other name
 * is ever read or written there.
 * `schedule.json` has the api or CLI as its writer; `cursor.json`, `slots.jsonl`, `fire.lock` and
 * `fire.lock.takeover` the watcher. `fire.lock` exists only while one watcher process evaluates
 * the schedule, so two daemons on one data home never decide the same slot twice;
 * `fire.lock.takeover` exists only while one process replaces a stale `fire.lock`.
 */
export const scheduleFileNames = {
  schedule: 'schedule.json',
  cursor: 'cursor.json',
  slots: 'slots.jsonl',
  fireLock: 'fire.lock',
  fireLockTakeover: 'fire.lock.takeover',
} as const;
export type ScheduleFileKey = keyof typeof scheduleFileNames;

/**
 * `schedules/<scheduleId>/fired/<slotMs>`: one claim file per slot the watcher decided to fire,
 * created with O_EXCL before the run is written, so a slot can be fired at most once even if two
 * processes ever hold `fire.lock` together. Watcher only; a claim is never removed except by its
 * claimant when its own run write failed.
 */
export const SLOT_CLAIMS_FOLDER_NAME = 'fired';

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

/**
 * `fire.lock` bounds. One evaluation holds the lock for milliseconds, so a lock older than
 * `staleMs` is abandoned even when its pid now names an unrelated live process (pid reuse). A
 * lock with no readable pid is someone's create in progress until it is `unreadableStaleMs` old.
 * `tailBytes` is how much of `slots.jsonl` is read to find slots already logged: more than the
 * 400 lines one evaluation can append.
 */
export const fireLockBounds = {
  staleMs: 600_000,
  unreadableStaleMs: 5_000,
  tailBytes: 262_144,
} as const;
