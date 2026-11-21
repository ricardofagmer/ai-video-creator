import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { FolderManifestSchema, type FolderEntry, type Sha256 } from '@studio/shared/catalog';
import { AssetStoreError } from './asset-store.errors';
import { ContentStore } from './content-store';
import { MAX_FOLDER_MANIFEST_BYTES } from './content-verifier';
import { sha256Hex } from './hashing';
import { resolveInside } from './path-guards';
import { ReferenceInspector } from './reference-inspector';

/** One file of a folder version: where to read it and the hash its bytes must have. */
export interface FolderFileSource {
  /** C1 `RelativePath`, forward slashes. */
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  contentHash: Sha256;
}

/** A resolved folder version, as `ResolvedAsset` describes it (`layout: 'folder'`). */
export interface FolderVersionSource {
  storage: 'store' | 'reference';
  contentHash: Sha256;
  /** The manifest blob for `store`, the registered folder for `reference`. */
  absolutePath: string;
}

export interface ListFolderOptions {
  maxBytes: number;
  signal?: AbortSignal;
}

export type FolderListingRejection = 'manifest-too-large' | 'manifest-invalid' | 'hash-mismatch';

/** The folder's bytes no longer match its version; the message stays path-free. */
export class FolderListingError extends AssetStoreError {
  override readonly category = 'validation';

  constructor(readonly rejection: FolderListingRejection) {
    super(`Folder listing refused: ${rejection}`);
    this.name = 'FolderListingError';
  }
}

function sourcesFrom(entries: readonly FolderEntry[], locate: (entry: FolderEntry) => string): FolderFileSource[] {
  return entries.map((entry) => ({
    relativePath: entry.path,
    absolutePath: locate(entry),
    sizeBytes: entry.sizeBytes,
    contentHash: entry.contentHash,
  }));
}

/**
 * The public read side of a folder asset (ADR 0003 decision 1): the files of a version, each with
 * the hash its bytes must have. A stored folder is read from its canonical manifest blob, whose
 * sha-256 must equal the version's hash; a referenced folder is walked and hashed, and the rebuilt
 * manifest hash must equal it. Nothing is written. Callers that copy the files still hash each
 * copy against `contentHash`, which closes the window between this listing and the copy.
 */
@Injectable()
export class FolderReader {
  constructor(
    private readonly store: ContentStore,
    private readonly references: ReferenceInspector,
  ) {}

  async listFiles(source: FolderVersionSource, options: ListFolderOptions): Promise<FolderFileSource[]> {
    return source.storage === 'store' ? this.listStored(source.contentHash, options.signal) : this.listReferenced(source, options);
  }

  private async listStored(contentHash: Sha256, signal: AbortSignal | undefined): Promise<FolderFileSource[]> {
    const manifestText = await this.readManifestText(this.store.blobPath(contentHash), signal);
    if (sha256Hex(manifestText) !== contentHash) throw new FolderListingError('hash-mismatch');
    let candidate: unknown;
    try {
      candidate = JSON.parse(manifestText);
    } catch {
      // A blob that is not JSON is refused like any other invalid manifest below.
      candidate = null;
    }
    const parsed = FolderManifestSchema.safeParse(candidate);
    if (!parsed.success) throw new FolderListingError('manifest-invalid');
    return sourcesFrom(parsed.data.files, (entry) => this.store.blobPath(entry.contentHash));
  }

  private async listReferenced(source: FolderVersionSource, options: ListFolderOptions): Promise<FolderFileSource[]> {
    const folder = await this.references.inspectFolder(source.absolutePath, options);
    if (folder.contentHash !== source.contentHash) throw new FolderListingError('hash-mismatch');
    return sourcesFrom(folder.manifest.files, (entry) => resolveInside(source.absolutePath, entry.path));
  }

  /** The manifest blob, opened without following a link and read only when it fits the bound. */
  private async readManifestText(manifestPath: string, signal: AbortSignal | undefined): Promise<string> {
    const handle = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size > MAX_FOLDER_MANIFEST_BYTES) throw new FolderListingError('manifest-too-large');
      return await handle.readFile({ encoding: 'utf8', signal });
    } finally {
      await handle.close();
    }
  }
}
