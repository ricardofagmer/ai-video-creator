/**
 * Node-only file helpers of the schedule protocol (SPEC 0006 section 4.1,
 * `@studio/shared/schedules/files`). They reuse the C5 atomic write, append and read helpers and
 * refuse any path outside `<data home>/schedules/<scheduleId>/`. Browser code imports
 * `@studio/shared/schedules` only.
 */
export {
  ScheduleFileExistsError,
  appendSlotLine,
  createSchedule,
  listScheduleIds,
  readScheduleCursor,
  readScheduleFile,
  readSlotLineTail,
  type SlotLineTail,
  readSlotLines,
  rewriteScheduleFile,
  writeScheduleCursor,
} from './schedule-files';
export { acquireFireLock, releaseFireLock, type FireLockResult } from './fire-lock';
export { claimSlot, releaseSlotClaim, type SlotClaimResult } from './slot-claim';
export { SchedulePathError, scheduleDirectory, scheduleFilePath, slotClaimPath, type ScheduleLocation } from './paths';
