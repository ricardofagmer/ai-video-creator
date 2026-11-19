import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { ScheduleIdSchema, type ScheduleId } from '../../common/ids';
import { RunFileError } from '../../run-files/errors';
import { SCHEDULES_FOLDER_NAME, scheduleFileNames, type ScheduleFileKey } from '../constants';

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

/** One of the three schedule files; no other name can be resolved inside a schedule folder. */
export function scheduleFilePath(location: ScheduleLocation, file: ScheduleFileKey): string {
  const directory = scheduleDirectory(location);
  const target = resolve(directory, scheduleFileNames[file]);
  if (dirname(target) !== directory || !target.startsWith(`${directory}${sep}`)) {
    throw new SchedulePathError(target, 'escapes the schedule folder');
  }
  return target;
}
