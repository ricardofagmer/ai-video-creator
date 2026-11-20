import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { ScheduleIdSchema, type ScheduleId } from '../../common/ids';
import { RunFileError } from '../../run-files/errors';
import { SCHEDULES_FOLDER_NAME, SLOT_CLAIMS_FOLDER_NAME, scheduleFileNames, type ScheduleFileKey } from '../constants';

/** A path that would leave `<data home>/schedules/` or name a folder that is not a schedule. */
export class SchedulePathError extends RunFileError {
  override readonly code = 'path-outside-run';

  constructor(filePath: string, reason: string) {
    super(`Refused schedule path (${reason}): ${filePath}`, filePath);
    this.name = 'SchedulePathError';
  }
}

/**
 * Where one schedule lives. `schedulesRoot` is the absolute data-home folder named `schedules`
 * (`DataHome.schedules`); `scheduleId` is validated as a ULID before any path is joined, so an
 * absolute id, a `..` segment or a separator can never reach `join`.
 */
export interface ScheduleLocation {
  readonly schedulesRoot: string;
  readonly scheduleId: ScheduleId;
}

/** The resolved `schedules/` root; refuses a relative path or a folder with another name. */
export function checkedSchedulesRoot(schedulesRoot: string): string {
  if (!isAbsolute(schedulesRoot)) throw new SchedulePathError(schedulesRoot, 'schedules root must be absolute');
  const root = resolve(schedulesRoot);
  if (basename(root) !== SCHEDULES_FOLDER_NAME) {
    throw new SchedulePathError(root, `schedules root must be a folder named ${SCHEDULES_FOLDER_NAME}`);
  }
  return root;
}

/** `<schedulesRoot>/<scheduleId>`. */
export function scheduleDirectory(location: ScheduleLocation): string {
  const root = checkedSchedulesRoot(location.schedulesRoot);
  if (!ScheduleIdSchema.safeParse(location.scheduleId).success) {
    throw new SchedulePathError(root, 'invalid scheduleId');
  }
  const directory = join(root, location.scheduleId);
  if (dirname(directory) !== root) throw new SchedulePathError(directory, 'escapes the schedules folder');
  return directory;
}

/** `<schedule folder>/fired/<slotMs>`; the slot instant must be a whole, non-negative millisecond. */
export function slotClaimPath(location: ScheduleLocation, slotAt: Date): string {
  const directory = join(scheduleDirectory(location), SLOT_CLAIMS_FOLDER_NAME);
  const slotMs = slotAt.getTime();
  if (!Number.isSafeInteger(slotMs) || slotMs < 0) throw new SchedulePathError(directory, 'invalid slot instant');
  const target = join(directory, String(slotMs));
  if (dirname(target) !== directory) throw new SchedulePathError(target, 'escapes the claims folder');
  return target;
}

/** One of the schedule files; no other name can be resolved inside a schedule folder. */
export function scheduleFilePath(location: ScheduleLocation, file: ScheduleFileKey): string {
  const directory = scheduleDirectory(location);
  const target = resolve(directory, scheduleFileNames[file]);
  if (dirname(target) !== directory || !target.startsWith(`${directory}${sep}`)) {
    throw new SchedulePathError(target, 'escapes the schedule folder');
  }
  return target;
}
