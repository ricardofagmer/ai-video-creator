import { type Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';

/** Bounds one walk of the asset store; past it the size is reported as a lower bound. */
const MAX_WALKED_ENTRIES = 500_000;

export interface StoreUsage {
  bytes: number;
  files: number;
  /** True when the walk stopped at `MAX_WALKED_ENTRIES`; `bytes` is then a lower bound. */
  truncated: boolean;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Sums regular files under the store (`<data home>/assets`, ADR 0003); links are not followed. */
export async function measureStore(root: string, signal: AbortSignal): Promise<StoreUsage> {
  const usage: StoreUsage = { bytes: 0, files: 0, truncated: false };
  const pending = [root];
  let walked = 0;
  while (pending.length > 0) {
    signal.throwIfAborted();
    const directory = pending.pop();
    if (directory === undefined) break;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) continue;
      throw error;
    }
    for (const entry of entries) {
      walked += 1;
      if (walked > MAX_WALKED_ENTRIES) return { ...usage, truncated: true };
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) {
        usage.bytes += (await lstat(path)).size;
        usage.files += 1;
      }
    }
  }
  return usage;
}

export interface UnreachableReference {
  ref: string;
  /** Null for biometric references: their path is never printed (PRD 12). */
  path: string | null;
}

/**
 * By-reference versions whose path no longer exists (moved or deleted; the next `preflight` would
 * stop on them, criterion 9). Existence only: `lstat`, no open, no read, no hash.
 */
export async function findUnreachableReferences(versions: readonly AssetVersion[], signal: AbortSignal): Promise<UnreachableReference[]> {
  const unreachable: UnreachableReference[] = [];
  for (const version of versions) {
    signal.throwIfAborted();
    if (version.storage.mode !== 'reference') continue;
    try {
      await lstat(version.storage.absolutePath);
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT') && !hasErrorCode(error, 'ENOTDIR') && !hasErrorCode(error, 'EACCES')) throw error;
      unreachable.push({
        ref: formatAssetRef({ assetId: version.id, version: version.version }),
        path: version.sensitivity === 'biometric' ? null : version.storage.absolutePath,
      });
    }
  }
  return unreachable;
}
