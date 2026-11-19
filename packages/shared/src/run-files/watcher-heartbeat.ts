import { constants } from 'node:fs';
import { mkdir, open, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { RUN_FORMAT_VERSION } from '../run-format/vocabulary';
import { WatcherHeartbeatSchema, watcherHeartbeatFileName, type WatcherHeartbeat } from '../run-format/watcher-heartbeat';
import { writeJsonAtomic } from './atomic-write';
import {
  RunFileInvalidJsonError,
  RunFileSchemaError,
  RunPathOutsideRunError,
  UnsupportedRunFormatError,
  describeZodIssues,
  hasErrorCode,
} from './errors';
import { type OptionalFile } from './read';

/** A valid heartbeat is under 100 bytes; a larger file is refused before it is read. */
const MAX_HEARTBEAT_BYTES = 1024;

/** The data home's `logs/` folder is owner-only (SPEC 0002 rev 4, section 13.3). */
const LOGS_FOLDER_MODE = 0o700;

function heartbeatPath(logsDir: string): string {
  if (!isAbsolute(logsDir)) throw new RunPathOutsideRunError(logsDir, 'logs folder must be absolute');
  return join(logsDir, watcherHeartbeatFileName);
}

/**
 * Writes `<logsDir>/watcher.heartbeat.json` through the C5 atomic helper (temp file, flush, rename;
 * mode 0600). Only the watcher daemon calls it: once at start, then every
 * `WATCHER_HEARTBEAT_INTERVAL_MS`. The value is validated first, so no pid or other key can be written.
 */
export async function writeWatcherHeartbeat(logsDir: string, heartbeat: WatcherHeartbeat): Promise<void> {
  const filePath = heartbeatPath(logsDir);
  // Creates the folder owner-only when it is missing; an existing folder keeps its mode.
  await mkdir(logsDir, { recursive: true, mode: LOGS_FOLDER_MODE });
  await writeJsonAtomic(filePath, WatcherHeartbeatSchema, heartbeat);
}

async function openHeartbeat(filePath: string): Promise<FileHandle | 'absent'> {
  try {
    // O_NOFOLLOW refuses a heartbeat replaced by a link; O_NONBLOCK keeps a FIFO from stalling the open.
    return await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    if (hasErrorCode(error, 'ELOOP')) throw new RunFileSchemaError(filePath, ['is a symbolic link']);
    throw error;
  }
}

async function readBoundedText(filePath: string): Promise<string | 'absent'> {
  const handle = await openHeartbeat(filePath);
  if (handle === 'absent') return 'absent';
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new RunFileSchemaError(filePath, ['is not a regular file']);
    if (stats.size > MAX_HEARTBEAT_BYTES) throw new RunFileSchemaError(filePath, [`is larger than ${MAX_HEARTBEAT_BYTES} bytes`]);
    const buffer = Buffer.alloc(MAX_HEARTBEAT_BYTES + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    // The file can grow between stat and read; the bound holds on the bytes actually read.
    if (filled > MAX_HEARTBEAT_BYTES) throw new RunFileSchemaError(filePath, [`is larger than ${MAX_HEARTBEAT_BYTES} bytes`]);
    return buffer.subarray(0, filled).toString('utf8');
  } finally {
    await handle.close();
  }
}

function parseHeartbeatJson(filePath: string, text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new RunFileInvalidJsonError(filePath, 'document', { cause: error });
  }
}

/**
 * Reads `<logsDir>/watcher.heartbeat.json`. A missing file reads `{ status: 'absent' }`. A link, a
 * non-regular file, a file over 1 KiB, invalid JSON, a newer `format` or a schema mismatch throws a
 * `RunFileError`; the api maps any throw to `dead` with `lastSeenAt: null` (A20). Freshness is the
 * reader's decision (`WATCHER_HEARTBEAT_STALE_AFTER_MS`); this helper only returns the typed value.
 */
export async function readWatcherHeartbeat(logsDir: string): Promise<OptionalFile<WatcherHeartbeat>> {
  const filePath = heartbeatPath(logsDir);
  const text = await readBoundedText(filePath);
  if (text === 'absent') return { status: 'absent' };
  const parsed = parseHeartbeatJson(filePath, text);
  if (typeof parsed === 'object' && parsed !== null && 'format' in parsed) {
    const { format } = parsed;
    if (typeof format === 'number' && Number.isInteger(format) && format > RUN_FORMAT_VERSION) {
      throw new UnsupportedRunFormatError(filePath, format);
    }
  }
  const checked = WatcherHeartbeatSchema.safeParse(parsed);
  if (!checked.success) throw new RunFileSchemaError(filePath, describeZodIssues(checked.error.issues));
  return { status: 'present', value: checked.data };
}
