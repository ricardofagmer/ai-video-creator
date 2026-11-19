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

export interface TraceOutputRequest {
  /** The owner's `--out`; never echoed nor logged. */
  path: string;
  force: boolean;
  dataHomeRoot: string;
  targetId: string;
}

export interface CheckedTraceOutput {
  absolutePath: string;
  force: boolean;
  targetId: string;
}

/**
 * Checks `--out` before anything is read: its folder must exist, it must lie outside the data home
 * (followed through links, so no export can create `approval.json`, `control.json` or any other
 * run, curation or schedule file), and an existing file is refused unless `--force` was given, in
 * which case it must be a regular file (ADR 0006 decision 2).
 */
export async function checkTraceOutput(request: TraceOutputRequest): Promise<CheckedTraceOutput> {
  const requested = resolve(request.path);
  const absolutePath = join(await realFolderOf(requested, request.targetId), basename(requested));
  if (isInside(absolutePath, await realOrResolved(request.dataHomeRoot))) {
    throw new TraceExportError('output-inside-data-home', request.targetId);
  }
  const existing = await lstatOrNull(absolutePath);
  if (existing !== null) {
    if (!request.force) throw new TraceExportError('output-exists', request.targetId);
    if (!existing.isFile()) throw new TraceExportError('output-not-a-file', request.targetId);
  }
  return { absolutePath, force: request.force, targetId: request.targetId };
}

/**
 * Writes the document to the checked path and to no other file: no temporary file, no rename.
 * Without `--force` the file is created exclusively (`O_EXCL`), so a file that appeared after the
 * check is still refused; a link is never followed (`O_NOFOLLOW`). A write that fails after an
 * exclusive create removes the partial file, which this command created.
 */
export async function writeTraceOutput(output: CheckedTraceOutput, text: string): Promise<void> {
  const mode = output.force ? constants.O_TRUNC : constants.O_EXCL;
  let handle: FileHandle;
  try {
    handle = await open(output.absolutePath, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | mode, OUTPUT_FILE_MODE);
  } catch (error) {
    throw asRefusal(error, output.targetId);
  }
  try {
    await handle.writeFile(text, 'utf8');
  } catch (error) {
    await handle.close();
    if (!output.force) await unlink(output.absolutePath);
    throw asRefusal(error, output.targetId);
  }
  await handle.close();
}
