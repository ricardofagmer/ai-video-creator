import { constants, type Dirent } from 'node:fs';
import { lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { PlatformPathError } from './paths';

/*
 * Small file primitives shared by the platform helpers (module-internal). Folders are `0700`, files
 * `0600` (SPEC 0007 section 4.6), because `platform/` holds owner text and account metadata.
 */

const FOLDER_MODE = 0o700;
const FILE_MODE = 0o600;

/** Creates `folder` (and missing parents) as `0700`; refuses one that is not a real folder. */
export async function ensureFolder(folder: string): Promise<void> {
  try {
    await mkdir(folder, { recursive: true, mode: FOLDER_MODE });
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) throw new RunFileWriteError(folder, { cause: error });
  }
  let stats;
  try {
    stats = await lstat(folder);
  } catch (error) {
    throw new RunFileWriteError(folder, { cause: error });
  }
  if (!stats.isDirectory()) throw new PlatformPathError(folder, 'not a directory');
}

/** O_EXCL create with `content`; false when the file already exists. A file it could not fill is removed. */
export async function createExclusive(filePath: string, content: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(filePath, 'wx', FILE_MODE);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return false;
    throw new RunFileWriteError(filePath, { cause: error });
  }
  try {
    await handle.writeFile(content, { encoding: 'utf8' });
    await handle.sync();
  } catch (error) {
    await handle.close();
    await removeIfPresent(filePath);
    throw new RunFileWriteError(filePath, { cause: error });
  }
  await handle.close();
  return true;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

export async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw new RunFileWriteError(filePath, { cause: error });
  }
}

/**
 * A small regular file's text, read without following a link or blocking on a FIFO. `absent` when
 * missing; `refused` when it is not a regular file or is larger than `maxBytes`.
 */
export async function readSmallFile(
  filePath: string,
  maxBytes: number,
): Promise<{ status: 'absent' } | { status: 'refused' } | { status: 'present'; text: string }> {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { status: 'absent' };
    if (hasErrorCode(error, 'ELOOP')) return { status: 'refused' };
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > maxBytes) return { status: 'refused' };
    return { status: 'present', text: await handle.readFile({ encoding: 'utf8' }) };
  } finally {
    await handle.close();
  }
}

/** Entries of `folder`; a missing folder lists nothing. */
export async function readFolderEntries(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
}

/** A decimal pid line written by these helpers, or null. */
export function parsePid(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[1-9][0-9]{0,6}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}
