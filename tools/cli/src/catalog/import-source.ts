import { type Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAX_REFERENCE_BYTES, MAX_STORED_BYTES_BY_KIND, type NewAssetContentInput } from '@studio/core/catalog';
import { type AssetKind } from '@studio/shared/catalog';
import { ImportSourceError } from '../errors/cli.errors.js';
import { mimeTypeForPath } from './mime-types.js';

export type ImportLayout = 'file' | 'folder';

export interface ImportSource {
  /** Absolute and normalized (`path.resolve`); the core re-checks it with `assertSafeSourcePath`. */
  absolutePath: string;
  layout: ImportLayout;
  /** File size; folders are bounded by the core walk while it hashes or copies. */
  sizeBytes: number | null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * Boundary check of the `catalog import` path: it exists, is a real file or folder (no link), and
 * only metadata is read (`lstat`); no byte of it is opened here.
 */
export async function inspectImportSource(path: string): Promise<ImportSource> {
  const absolutePath = resolve(path);
  let stats: Stats;
  try {
    stats = await lstat(absolutePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) throw new ImportSourceError('not-found');
    throw error;
  }
  if (stats.isSymbolicLink()) throw new ImportSourceError('symlink');
  if (stats.isFile()) return { absolutePath, layout: 'file', sizeBytes: stats.size };
  if (stats.isDirectory()) return { absolutePath, layout: 'folder', sizeBytes: null };
  throw new ImportSourceError('unsupported-type');
}

/** PRD 5.3 size limits, checked before the core reads a byte (it checks again while hashing). */
export function assertImportSize(source: ImportSource, kind: AssetKind, byReference: boolean): void {
  if (source.sizeBytes === null) return;
  const limit = byReference ? MAX_REFERENCE_BYTES : MAX_STORED_BYTES_BY_KIND[kind];
  if (source.sizeBytes > limit) throw new ImportSourceError('too-large');
}

/** The core `NewAssetContentInput`: copy into the store, or register by reference (hash only). */
export function toContentInput(source: ImportSource, byReference: boolean, mimeOption: string | undefined): NewAssetContentInput {
  if (source.layout === 'folder') {
    return byReference
      ? { source: 'reference-folder', absolutePath: source.absolutePath }
      : { source: 'import-folder', absolutePath: source.absolutePath };
  }
  const mimeType = mimeOption ?? mimeTypeForPath(source.absolutePath);
  if (mimeType === null) throw new ImportSourceError('mime-unknown');
  return byReference
    ? { source: 'reference-file', absolutePath: source.absolutePath, mimeType }
    : { source: 'import-file', absolutePath: source.absolutePath, mimeType };
}
