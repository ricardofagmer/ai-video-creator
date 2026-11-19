import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { FolderManifestSchema, type Sha256 } from '@studio/shared/catalog';
import { ContentStore, MAX_FOLDER_MANIFEST_BYTES } from '../asset-store';
import { type StoredKindTextSource, type StoredTextReader } from './embedding-document';

/** UTF-8 uses at most 4 bytes per character, so this many bytes always hold `maxChars` characters. */
const MAX_BYTES_PER_CHAR = 4;

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'ELOOP');
}

/**
 * Reads kind text for the embedding document from the content-addressed store only (SPEC 0003
 * section 5.2 item 6). Every path is `ContentStore.blobPath(hash)`, built from a validated sha-256,
 * so no catalog path, by-reference target or biometric file can reach it; `O_NOFOLLOW` refuses a
 * blob replaced by a symlink. Reads are bounded to what the 2,000-character document can hold.
 */
@Injectable()
export class ContentStoreTextReader implements StoredTextReader {
  constructor(private readonly store: ContentStore) {}

  async read(source: StoredKindTextSource, maxChars: number): Promise<string | null> {
    if (maxChars <= 0) return null;
    if (source.type === 'stored-file') return this.readBlobText(source.contentHash, maxChars * MAX_BYTES_PER_CHAR);
    const manifestText = await this.readBlobText(source.manifestHash, MAX_FOLDER_MANIFEST_BYTES);
    if (manifestText === null) return null;
    const entryHash = this.entryHashOf(manifestText, source.entryFile);
    return entryHash === null ? null : this.readBlobText(entryHash, maxChars * MAX_BYTES_PER_CHAR);
  }

  private entryHashOf(manifestText: string, entryFile: string): Sha256 | null {
    let candidate: unknown;
    try {
      candidate = JSON.parse(manifestText);
    } catch {
      // A corrupt folder manifest leaves the skill embedded from its metadata only.
      return null;
    }
    const manifest = FolderManifestSchema.safeParse(candidate);
    if (!manifest.success) return null;
    return manifest.data.files.find((file) => file.path === entryFile)?.contentHash ?? null;
  }

  /** Null when the blob is missing; the version is then embedded without its kind text. */
  private async readBlobText(contentHash: Sha256, maxBytes: number): Promise<string | null> {
    let handle: FileHandle;
    try {
      handle = await open(this.store.blobPath(contentHash), constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    try {
      const buffer = Buffer.alloc(maxBytes);
      let filled = 0;
      while (filled < buffer.length) {
        const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
        if (bytesRead === 0) break;
        filled += bytesRead;
      }
      // A cut inside a multi-byte character decodes to U+FFFD at the end; drop it.
      return buffer.subarray(0, filled).toString('utf8').replace(/�+$/u, '');
    } finally {
      await handle.close();
    }
  }
}
