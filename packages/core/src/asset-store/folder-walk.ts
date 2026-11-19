import { lstat, readdir } from 'node:fs/promises';
import { RelativePathSchema, type FolderEntry } from '@studio/shared/catalog';
import { ContentTooLargeError, UnsafePathError, UnsupportedFolderError } from './asset-store.errors';
import { type HashedContent } from './hashing';
import { resolveInside } from './path-guards';

/** Mirrors the max of C1 `FolderManifestSchema.files`. */
export const MAX_FOLDER_FILES = 10000;

/** Deeper trees are refused; no seed or skill folder comes close. */
export const MAX_FOLDER_DEPTH = 32;

/**
 * Finder writes `.DS_Store` when a folder is merely browsed; counting it would change the hash of
 * an untouched skill or voice folder and fail `preflight` for no reason.
 */
export const IGNORED_FOLDER_ENTRY_NAMES: readonly string[] = ['.DS_Store'];

export interface FolderFile {
  /** C1 `RelativePath`, forward slashes. */
  relativePath: string;
  absolutePath: string;
}

export interface FolderLimits {
  maxTotalBytes: number;
}

/**
 * Lists the regular files of a folder, sorted by relative path in code-unit order (the C1
 * canonical order). Symlinks and special files are refused, so the walk never leaves `root`.
 */
export async function listFolderFiles(root: string): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  const pending: { relative: string; depth: number }[] = [{ relative: '', depth: 0 }];

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.depth > MAX_FOLDER_DEPTH) throw new UnsupportedFolderError('too-deep', next.relative);
    const directory = next.relative === '' ? root : resolveInside(root, next.relative);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_FOLDER_ENTRY_NAMES.includes(entry.name)) continue;
      const relativePath = next.relative === '' ? entry.name : `${next.relative}/${entry.name}`;
      if (!RelativePathSchema.safeParse(relativePath).success) throw new UnsupportedFolderError('invalid-name', relativePath);
      const absolutePath = resolveInside(root, relativePath);
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) throw new UnsupportedFolderError('symlink', relativePath);
      if (stats.isDirectory()) {
        pending.push({ relative: relativePath, depth: next.depth + 1 });
      } else if (stats.isFile()) {
        files.push({ relativePath, absolutePath });
        if (files.length > MAX_FOLDER_FILES) throw new UnsupportedFolderError('too-many-files', null);
      } else {
        throw new UnsupportedFolderError('special-file', relativePath);
      }
    }
  }

  if (files.length === 0) throw new UnsupportedFolderError('empty', null);
  return files.sort((left, right) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
  );
}

/**
 * Builds the canonical C1 folder manifest entries by handing each file to `processFile`, one at a
 * time (bounded I/O). `processFile` either hashes in place (by reference) or copies into the store.
 */
export async function buildFolderEntries(
  files: readonly FolderFile[],
  limits: FolderLimits,
  processFile: (file: FolderFile, remainingBytes: number) => Promise<HashedContent>,
): Promise<{ entries: FolderEntry[]; totalBytes: number }> {
  const entries: FolderEntry[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const remainingBytes = limits.maxTotalBytes - totalBytes;
    if (remainingBytes < 0) throw new ContentTooLargeError(limits.maxTotalBytes);
    const hashed = await processFile(file, remainingBytes);
    totalBytes += hashed.sizeBytes;
    entries.push({ path: file.relativePath, sizeBytes: hashed.sizeBytes, contentHash: hashed.contentHash });
  }
  return { entries, totalBytes };
}

/** Confirms `root` is a real directory before a walk; a file or symlink here is refused. */
export async function assertFolder(root: string): Promise<void> {
  const stats = await lstat(root);
  if (!stats.isDirectory()) throw new UnsafePathError('not-a-folder');
}
