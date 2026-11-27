import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { hasErrorCode } from '../platform/error-code';

/*
 * The file operations setup needs, behind one port so tests pass a fake rooted in a temporary
 * folder. Every path is absolute and comes from `SetupPaths`, never from user input.
 */

export type EntryInspection =
  | { readonly kind: 'absent' }
  | { readonly kind: 'folder' | 'file' | 'symlink' | 'other'; readonly mode: number };

export type TextRead = { readonly status: 'absent' } | { readonly status: 'too-large' } | { readonly status: 'read'; readonly text: string };

export interface SetupFileSystem {
  /** `lstat`: a symlink is reported as such, never followed. `mode` holds the permission bits only. */
  inspect(path: string): Promise<EntryInspection>;
  /** One level, never recursive, so a missing parent is noticed rather than created. */
  makeFolder(path: string, mode: number): Promise<void>;
  setMode(path: string, mode: number): Promise<void>;
  readText(path: string, maxBytes: number): Promise<TextRead>;
  /** Temporary file beside the target, then a rename, so a reader never sees half a file. */
  writeTextAtomic(path: string, text: string, mode: number): Promise<void>;
  /** Absent is not an error. */
  removeFile(path: string): Promise<void>;
  /** Hex SHA-256 of a regular file, streamed; null when the file is absent. */
  sha256(path: string): Promise<string | null>;
}

const PERMISSION_BITS = 0o777;

function kindOf(stats: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }): 'folder' | 'file' | 'symlink' | 'other' {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'folder';
  if (stats.isFile()) return 'file';
  return 'other';
}

function isAbsent(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR');
}

function hashFile(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

export const nodeSetupFileSystem: SetupFileSystem = {
  async inspect(path) {
    try {
      const stats = await lstat(path);
      return { kind: kindOf(stats), mode: stats.mode & PERMISSION_BITS };
    } catch (error) {
      if (isAbsent(error)) return { kind: 'absent' };
      throw error;
    }
  },
  async makeFolder(path, mode) {
    await mkdir(path, { mode });
    // mkdir applies the process umask; the mode is set again so it is exactly what was asked.
    await chmod(path, mode);
  },
  async setMode(path, mode) {
    await chmod(path, mode);
  },
  async readText(path, maxBytes) {
    let content: Buffer;
    try {
      const stats = await lstat(path);
      if (!stats.isFile()) return { status: 'absent' };
      if (stats.size > maxBytes) return { status: 'too-large' };
      content = await readFile(path);
    } catch (error) {
      if (isAbsent(error)) return { status: 'absent' };
      throw error;
    }
    if (content.length > maxBytes) return { status: 'too-large' };
    return { status: 'read', text: content.toString('utf8') };
  },
  async writeTextAtomic(path, text, mode) {
    const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temporary, text, { mode, flag: 'wx' });
      await chmod(temporary, mode);
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  },
  async removeFile(path) {
    await rm(path, { force: true });
  },
  async sha256(path) {
    try {
      return await hashFile(path);
    } catch (error) {
      if (isAbsent(error)) return null;
      throw error;
    }
  },
};
