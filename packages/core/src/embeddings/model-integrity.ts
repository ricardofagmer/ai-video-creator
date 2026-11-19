import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { type EmbeddingModelManifest, type RelativePath } from '@studio/shared/catalog';
import { ContentTooLargeError, SourceNotFoundError, hashFile, isInsideOrEqual } from '../asset-store';

/** Why a model folder was refused; the `reason` of `embeddings.model-rejected` (SPEC 0003 section 7). */
export type ModelRejectionReason = 'missing' | 'size' | 'hash';

/**
 * Result of re-hashing the model folder against the manifest before the first inference.
 * `absent`: no manifest file is present (not provisioned, or the download never succeeded, B7).
 * `rejected`: some files are present but at least one is missing, of another size, of another
 * hash, or not a plain file inside the folder. `file` is the manifest-relative name, never a path.
 */
export type ModelIntegrityResult =
  | { readonly status: 'verified' }
  | { readonly status: 'absent' }
  | { readonly status: 'rejected'; readonly reason: ModelRejectionReason; readonly file: RelativePath | null };

type FileCheck = { readonly status: 'ok' } | { readonly status: 'not-found' } | { readonly status: 'rejected'; readonly reason: ModelRejectionReason };

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/**
 * One manifest file: a plain file (a symlink is refused, so nothing outside the folder is ever
 * handed to the native runtime), resolving inside the folder, of the pinned size and sha-256.
 */
async function checkFile(realDirectory: string, entry: EmbeddingModelManifest['files'][number]): Promise<FileCheck> {
  const candidate = join(realDirectory, entry.path);
  try {
    const stats = await lstat(candidate);
    if (!stats.isFile()) return { status: 'rejected', reason: 'missing' };
    if (!isInsideOrEqual(realDirectory, await realpath(candidate))) return { status: 'rejected', reason: 'missing' };
    if (stats.size !== entry.sizeBytes) return { status: 'rejected', reason: 'size' };
    const hashed = await hashFile(candidate, { maxBytes: entry.sizeBytes });
    if (hashed.sizeBytes !== entry.sizeBytes) return { status: 'rejected', reason: 'size' };
    return hashed.contentHash === entry.sha256 ? { status: 'ok' } : { status: 'rejected', reason: 'hash' };
  } catch (error) {
    if (isNotFound(error) || error instanceof SourceNotFoundError) return { status: 'not-found' };
    // The file grew between the size check and the hash.
    if (error instanceof ContentTooLargeError) return { status: 'rejected', reason: 'size' };
    throw error;
  }
}

/**
 * Re-hashes every manifest file (SPEC 0003 section 5.2 "Integrity at load", R2-AC-07). Read-only:
 * it opens, stats and hashes the pinned files and writes, downloads and deletes nothing. Files in
 * the folder that the manifest does not list are ignored here and never loaded.
 */
export async function verifyModelDirectory(directory: string, manifest: EmbeddingModelManifest): Promise<ModelIntegrityResult> {
  let realDirectory: string;
  try {
    const stats = await lstat(directory);
    if (!stats.isDirectory()) return { status: 'rejected', reason: 'missing', file: null };
    realDirectory = await realpath(directory);
  } catch (error) {
    if (isNotFound(error)) return { status: 'absent' };
    throw error;
  }
  let present = 0;
  let firstMissing: RelativePath | null = null;
  for (const entry of manifest.files) {
    const check = await checkFile(realDirectory, entry);
    if (check.status === 'rejected') return { status: 'rejected', reason: check.reason, file: entry.path };
    if (check.status === 'not-found') {
      firstMissing ??= entry.path;
      continue;
    }
    present += 1;
  }
  if (present === 0) return { status: 'absent' };
  if (firstMissing !== null) return { status: 'rejected', reason: 'missing', file: firstMissing };
  return { status: 'verified' };
}
