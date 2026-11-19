import { readFile, stat } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { FolderManifestSchema, type AssetLayout, type FolderEntry, type Sha256 } from '@studio/shared/catalog';
import { AssetStoreError } from './asset-store.errors';
import { ContentStore } from './content-store';
import { folderContentFrom } from './folder-content';
import { hashFile, sha256Hex } from './hashing';
import { isErrnoException } from './path-guards';
import { ReferenceInspector } from './reference-inspector';

/** Upper bound for a re-hash; large references (checkpoints) are hashed in full (ADR 0003). */
export const REHASH_MAX_BYTES = 64 * 1024 ** 3;

/** A canonical manifest of 10,000 entries stays well under this. */
export const MAX_FOLDER_MANIFEST_BYTES = 4 * 1024 ** 2;

/**
 * Outcome of re-hashing a version's bytes. `missing` covers a deleted file and a target that can
 * no longer be read as the registered layout (moved, replaced by a symlink, emptied).
 */
export type RehashOutcome = { status: 'hashed'; contentHash: Sha256; sizeBytes: number } | { status: 'missing' };

const missing: RehashOutcome = { status: 'missing' };

function isMissingError(error: unknown): boolean {
  if (error instanceof AssetStoreError) return error.category !== 'internal';
  return isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

/** Read-only re-hash of stored and referenced content, used by `preflight` resolution (C6). */
@Injectable()
export class ContentVerifier {
  constructor(
    private readonly store: ContentStore,
    private readonly references: ReferenceInspector,
  ) {}

  async rehashStored(contentHash: Sha256, layout: AssetLayout, signal: AbortSignal): Promise<RehashOutcome> {
    try {
      return layout === 'file'
        ? { status: 'hashed', ...(await hashFile(this.store.blobPath(contentHash), { maxBytes: REHASH_MAX_BYTES, signal })) }
        : await this.rehashStoredFolder(contentHash, signal);
    } catch (error) {
      if (isMissingError(error)) return missing;
      throw error;
    }
  }

  async rehashReference(absolutePath: string, layout: AssetLayout, signal: AbortSignal): Promise<RehashOutcome> {
    try {
      const hashed =
        layout === 'file'
          ? await this.references.inspectFile(absolutePath, { maxBytes: REHASH_MAX_BYTES, signal })
          : await this.references.inspectFolder(absolutePath, { maxBytes: REHASH_MAX_BYTES, signal });
      return { status: 'hashed', contentHash: hashed.contentHash, sizeBytes: hashed.sizeBytes };
    } catch (error) {
      if (isMissingError(error)) return missing;
      throw error;
    }
  }

  /**
   * The manifest blob is hashed first; when it matches, every listed file blob is re-hashed and
   * the manifest is rebuilt from the actual hashes, so one changed file changes the result.
   */
  private async rehashStoredFolder(contentHash: Sha256, signal: AbortSignal): Promise<RehashOutcome> {
    const manifestPath = this.store.blobPath(contentHash);
    if ((await stat(manifestPath)).size > MAX_FOLDER_MANIFEST_BYTES) {
      return { status: 'hashed', ...(await hashFile(manifestPath, { maxBytes: REHASH_MAX_BYTES, signal })) };
    }
    const manifestText = await readFile(manifestPath, { encoding: 'utf8', signal });
    const manifestHash = sha256Hex(manifestText);
    const parsed = manifestHash === contentHash ? FolderManifestSchema.safeParse(JSON.parse(manifestText)) : undefined;
    if (parsed === undefined || !parsed.success) {
      return { status: 'hashed', contentHash: manifestHash, sizeBytes: Buffer.byteLength(manifestText, 'utf8') };
    }

    const actualEntries: FolderEntry[] = [];
    let totalBytes = 0;
    for (const entry of parsed.data.files) {
      const actual = await hashFile(this.store.blobPath(entry.contentHash), { maxBytes: REHASH_MAX_BYTES, signal });
      actualEntries.push({ path: entry.path, sizeBytes: actual.sizeBytes, contentHash: actual.contentHash });
      totalBytes += actual.sizeBytes;
    }
    const rebuilt = folderContentFrom(actualEntries, totalBytes);
    return { status: 'hashed', contentHash: rebuilt.contentHash, sizeBytes: rebuilt.sizeBytes };
  }
}
