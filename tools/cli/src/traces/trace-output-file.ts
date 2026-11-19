import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath, unlink, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { TraceExportError, type TraceExportRefusal } from './trace-errors.js';

/** Owner-only, like every run file: the export names run, session and curation ids. */
const OUTPUT_FILE_MODE = 0o600;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

const refusalByErrorCode: Readonly<Record<string, TraceExportRefusal>> = {
  EEXIST: 'output-exists',
  ELOOP: 'output-not-a-file',
  EISDIR: 'output-not-a-file',
  ENOENT: 'output-folder-missing',
  ENOTDIR: 'output-folder-missing',
  EACCES: 'output-not-writable',
  EPERM: 'output-not-writable',
  EROFS: 'output-not-writable',
};

/** File-system failures the owner can act on become typed refusals; the path is never echoed. */
function asRefusal(error: unknown, targetId: string): unknown {
  const code = errorCode(error);
  const refusal = code === undefined ? undefined : refusalByErrorCode[code];
  return refusal === undefined ? error : new TraceExportError(refusal, targetId);
}

async function realFolderOf(absolutePath: string, targetId: string): Promise<string> {
  try {
    return await realpath(dirname(absolutePath));
  } catch (error) {
    throw asRefusal(error, targetId);
  }
}

/** The data home may not exist yet; then nothing can be inside it except through its plain path. */
async function realOrResolved(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return resolve(path);
    throw error;
  }
}

function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/** The inode a path named; a hard link or a swapped file shows up as another identity or link count. */
interface FileIdentity {
  dev: number;
  ino: number;
}

function sameFile(stats: Stats, identity: FileIdentity): boolean {
  return stats.dev === identity.dev && stats.ino === identity.ino;
}

/**
 * Refuses a path that resolves into the data home, followed through every link of its folder, so no
 * export can create or replace `approval.json`, `control.json` or any other run, curation or
 * schedule file (RUN-FORMAT section 4).
 */
async function assertOutsideDataHome(absolutePath: string, dataHomeRoot: string, targetId: string): Promise<string> {
  const resolvedPath = join(await realFolderOf(absolutePath, targetId), basename(absolutePath));
  if (isInside(resolvedPath, await realOrResolved(dataHomeRoot))) {
    throw new TraceExportError('output-inside-data-home', targetId);
  }
  return resolvedPath;
}

export interface TraceOutputRequest {
  /** The owner's `--out`; never echoed nor logged. */
  path: string;
  force: boolean;
  dataHomeRoot: string;
  targetId: string;
}

export interface CheckedTraceOutput {
  absolutePath: string;
  dataHomeRoot: string;
  /** The regular file `--force` may replace, as the check saw it; null when the check saw no file. */
  replaces: FileIdentity | null;
  targetId: string;
}

/**
 * Checks `--out` before anything is read: its folder must exist, it must lie outside the data home
 * (followed through links), and an existing file is refused unless `--force` was given, in which
 * case it must be a regular file with a single name (a hard link could name a data-home file)
 * (ADR 0006 decision 2).
 */
export async function checkTraceOutput(request: TraceOutputRequest): Promise<CheckedTraceOutput> {
  const absolutePath = await assertOutsideDataHome(resolve(request.path), request.dataHomeRoot, request.targetId);
  const existing = await lstatOrNull(absolutePath);
  if (existing === null) return { absolutePath, dataHomeRoot: request.dataHomeRoot, replaces: null, targetId: request.targetId };
  if (!request.force) throw new TraceExportError('output-exists', request.targetId);
  if (!existing.isFile() || existing.nlink !== 1) throw new TraceExportError('output-not-a-file', request.targetId);
  return { absolutePath, dataHomeRoot: request.dataHomeRoot, replaces: { dev: existing.dev, ino: existing.ino }, targetId: request.targetId };
}

/**
 * Re-checks the opened file before a byte changes, since the folder or the file may have been
 * swapped after `checkTraceOutput`: it must be a regular file with one name, the very file the
 * check saw when replacing, still at the checked path, whose folder still lies outside the data home.
 */
async function assertOpenedFileIsChecked(opened: Stats, output: CheckedTraceOutput): Promise<void> {
  if (!opened.isFile() || opened.nlink !== 1) throw new TraceExportError('output-not-a-file', output.targetId);
  if (output.replaces !== null && !sameFile(opened, output.replaces)) throw new TraceExportError('output-not-a-file', output.targetId);
  await assertOutsideDataHome(output.absolutePath, output.dataHomeRoot, output.targetId);
  const atPath = await lstatOrNull(output.absolutePath);
  if (atPath === null || !sameFile(atPath, opened)) throw new TraceExportError('output-not-a-file', output.targetId);
}

/** Removes a file this command created, and only while the path still names that very file. */
async function removeCreatedFile(output: CheckedTraceOutput, created: Stats | null): Promise<void> {
  if (output.replaces !== null || created === null) return;
  const atPath = await lstatOrNull(output.absolutePath);
  if (atPath !== null && sameFile(atPath, created)) await unlink(output.absolutePath);
}

/**
 * Writes the document to the checked path and to no other file: no temporary file, no rename. A path
 * the check saw empty is created exclusively (`O_EXCL`), so a file that appeared after the check is
 * refused; a link is never followed (`O_NOFOLLOW`). Nothing is truncated at open: the opened file is
 * re-checked first (`assertOpenedFileIsChecked`), and only then emptied and written. A refusal or a
 * failed write after an exclusive create removes the file, which this command created.
 */
export async function writeTraceOutput(output: CheckedTraceOutput, text: string): Promise<void> {
  const exclusive = output.replaces === null ? constants.O_EXCL : 0;
  let handle: FileHandle;
  try {
    handle = await open(output.absolutePath, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | exclusive, OUTPUT_FILE_MODE);
  } catch (error) {
    throw asRefusal(error, output.targetId);
  }
  let opened: Stats | null = null;
  try {
    opened = await handle.stat();
    await assertOpenedFileIsChecked(opened, output);
    await handle.truncate(0);
    await handle.writeFile(text, 'utf8');
  } catch (error) {
    await handle.close();
    await removeCreatedFile(output, opened);
    throw asRefusal(error, output.targetId);
  }
  await handle.close();
}
