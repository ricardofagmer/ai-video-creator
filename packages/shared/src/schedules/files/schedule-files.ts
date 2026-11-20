import { constants, type Dirent } from 'node:fs';
import { lstat, mkdir, open, readdir, rmdir } from 'node:fs/promises';
import { ScheduleIdSchema, type ScheduleId } from '../../common/ids';
import { appendJsonLine, writeJsonAtomic } from '../../run-files/atomic-write';
import { RunFileError, RunFileNotFoundError, RunFileSchemaError, RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { readJsonLines, readOptionalJsonFile, type JsonLinesPage, type OptionalFile } from '../../run-files/read';
import { fireLockBounds } from '../constants';
import { ScheduleFileSchema, type ScheduleFile } from '../schedule-file';
import { ScheduleCursorSchema, SlotLineSchema, type ScheduleCursor, type SlotLine } from '../slot-log';
import { checkedSchedulesRoot, scheduleDirectory, scheduleFilePath, type ScheduleLocation } from './paths';

/*
 * Writers (SPEC 0006 section 4.6, K2): `schedule.json` is written only by the api or the CLI
 * (`createSchedule`, `rewriteScheduleFile`); `cursor.json` and `slots.jsonl` only by the watcher
 * (`writeScheduleCursor`, `appendSlotLine`). No file has two writers. These helpers cannot tell the
 * processes apart; each caller imports only its own writers, which inspection of the two schedule
 * scopes checks (R3-AC-19).
 */

/** Schedule folders hold owner brief text; only the owner's account reads them. */
const SCHEDULE_FOLDER_MODE = 0o700;

/** A schedule folder that already exists. */
export class ScheduleFileExistsError extends RunFileError {
  override readonly code = 'write-failed';

  constructor(filePath: string) {
    super(`Schedule already exists: ${filePath}`, filePath);
    this.name = 'ScheduleFileExistsError';
  }
}

function assertSameSchedule(filePath: string, location: ScheduleLocation, scheduleId: ScheduleId): void {
  if (scheduleId !== location.scheduleId) {
    throw new RunFileSchemaError(filePath, ['scheduleId does not match the schedule folder']);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function removeEmptyFolder(directory: string, writeError: unknown): Promise<void> {
  try {
    await rmdir(directory);
  } catch (cleanupError) {
    throw new RunFileWriteError(directory, {
      cause: new AggregateError([writeError, cleanupError], 'write failed and the new schedule folder was not removed'),
    });
  }
}

/**
 * The api's or CLI's create (section 5.5 step 6): creates `schedules/<scheduleId>/` exclusively
 * (an existing folder throws `ScheduleFileExistsError`), then writes `schedule.json` atomically.
 * Only status `active` is accepted for a new schedule.
 */
export async function createSchedule(location: ScheduleLocation, file: ScheduleFile): Promise<void> {
  const filePath = scheduleFilePath(location, 'schedule');
  assertSameSchedule(filePath, location, file.scheduleId);
  if (file.status !== 'active') throw new RunFileSchemaError(filePath, ['a new schedule must have status active']);
  const directory = scheduleDirectory(location);
  await mkdir(checkedSchedulesRoot(location.schedulesRoot), { recursive: true, mode: SCHEDULE_FOLDER_MODE });
  try {
    await mkdir(directory, { mode: SCHEDULE_FOLDER_MODE });
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) throw new ScheduleFileExistsError(directory);
    throw new RunFileWriteError(directory, { cause: error });
  }
  try {
    await writeJsonAtomic(filePath, ScheduleFileSchema, file);
  } catch (error) {
    await removeEmptyFolder(directory, error);
    throw error;
  }
}

/**
 * The api's or CLI's later writes (pause, resume, delete, add or remove briefs): one atomic
 * rewrite of an existing `schedule.json`. A missing file throws `RunFileNotFoundError`, so a
 * rewrite never creates a schedule. The caller enforces that `deleted` is final.
 */
export async function rewriteScheduleFile(location: ScheduleLocation, file: ScheduleFile): Promise<void> {
  const filePath = scheduleFilePath(location, 'schedule');
  assertSameSchedule(filePath, location, file.scheduleId);
  // Single writer (the api or the CLI booting the same handlers), so check-then-write cannot race.
  if (!(await pathExists(filePath))) throw new RunFileNotFoundError(filePath);
  await writeJsonAtomic(filePath, ScheduleFileSchema, file);
}

/** `schedule.json`; absent only while the folder is being created. */
export async function readScheduleFile(location: ScheduleLocation): Promise<OptionalFile<ScheduleFile>> {
  return readOptionalJsonFile(scheduleFilePath(location, 'schedule'), ScheduleFileSchema);
}

/** The watcher's `cursor.json` rewrite, after the slot lines of one evaluation. */
export async function writeScheduleCursor(location: ScheduleLocation, cursor: ScheduleCursor): Promise<void> {
  const filePath = scheduleFilePath(location, 'cursor');
  assertSameSchedule(filePath, location, cursor.scheduleId);
  await writeJsonAtomic(filePath, ScheduleCursorSchema, cursor);
}

/** `cursor.json`; absent until the watcher first evaluates the schedule. */
export async function readScheduleCursor(location: ScheduleLocation): Promise<OptionalFile<ScheduleCursor>> {
  return readOptionalJsonFile(scheduleFilePath(location, 'cursor'), ScheduleCursorSchema);
}

/** The watcher's append of one decided slot to `slots.jsonl`; the file is never rewritten. */
export async function appendSlotLine(location: ScheduleLocation, line: SlotLine): Promise<void> {
  await appendJsonLine(scheduleFilePath(location, 'slots'), SlotLineSchema, line);
}

/** Slot lines from a byte offset; pass the returned `nextByte` on the next read. */
export async function readSlotLines(location: ScheduleLocation, fromByte = 0, maxBytes?: number): Promise<JsonLinesPage<SlotLine>> {
  return readJsonLines(scheduleFilePath(location, 'slots'), SlotLineSchema, fromByte, maxBytes);
}

/** The last `maxBytes` of a file, from the first byte after a newline when it starts mid-file. */
async function readLineAlignedTail(filePath: string, maxBytes: number): Promise<Buffer | 'absent'> {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    throw error;
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(Math.min(size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const bytes = buffer.subarray(0, bytesRead);
    if (start === 0) return bytes;
    const newline = bytes.indexOf(0x0a);
    return newline === -1 ? Buffer.alloc(0) : bytes.subarray(newline + 1);
  } finally {
    await handle.close();
  }
}

function parseSlotLine(text: string): SlotLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A line joined onto a partial append (power loss, disk full) is not JSON; counted, not fatal.
    return null;
  }
  const checked = SlotLineSchema.safeParse(parsed);
  return checked.success ? checked.data : null;
}

/** Complete lines of the tail; `unreadableLines` counts those that are not valid slot lines. */
export interface SlotLineTail {
  lines: SlotLine[];
  unreadableLines: number;
}

/**
 * The slot lines in the last `maxBytes` of `slots.jsonl`, whole lines only. The watcher reads it
 * before deciding slots, so a slot logged before a crash (the line written, the cursor not yet
 * moved) is never logged a second time. Unlike `readSlotLines`, a line that does not parse is
 * counted and passed over: a damaged line must never stop the schedule for good.
 */
export async function readSlotLineTail(location: ScheduleLocation, maxBytes: number = fireLockBounds.tailBytes): Promise<SlotLineTail> {
  const bytes = await readLineAlignedTail(scheduleFilePath(location, 'slots'), maxBytes);
  if (bytes === 'absent') return { lines: [], unreadableLines: 0 };
  const complete = bytes.subarray(0, bytes.lastIndexOf(0x0a) + 1).toString('utf8');
  const tail: SlotLineTail = { lines: [], unreadableLines: 0 };
  for (const text of complete.split('\n')) {
    if (text.trim() === '') continue;
    const line = parseSlotLine(text);
    if (line === null) tail.unreadableLines += 1;
    else tail.lines.push(line);
  }
  return tail;
}

async function readFolderEntries(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
}

/**
 * The schedule ids under `schedules/`, oldest first (ULID order). Only real folders named by a
 * ULID count: links, files and other names are ignored. A missing root lists nothing.
 */
export async function listScheduleIds(schedulesRoot: string): Promise<ScheduleId[]> {
  const entries = await readFolderEntries(checkedSchedulesRoot(schedulesRoot));
  const scheduleIds: ScheduleId[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const scheduleId = ScheduleIdSchema.safeParse(entry.name);
    if (scheduleId.success) scheduleIds.push(scheduleId.data);
  }
  return scheduleIds.sort();
}
