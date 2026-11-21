import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, link, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { Sha256Schema, contentStorePath, type Sha256 } from '@studio/shared/catalog';
import { DataHome } from '../paths/data-home';
import { UnsafePathError } from './asset-store.errors';
import { HeadCollector, type HeadInspector } from './content-head';
import { folderContentFrom, type FolderContent } from './folder-content';
import { assertFolder, buildFolderEntries, listFolderFiles, type FolderFile } from './folder-walk';
import { BoundedHasher, chunkToBuffer, type HashedContent } from './hashing';
import { assertSafeSourcePath, isErrnoException, resolveInside } from './path-guards';
import { openRegularFile, type FileIdentity } from './regular-file';

/** Store folders are owner-only, like the data home. */
const STORE_DIRECTORY_MODE = 0o700;
/** Temp files are owner-writable only while they are being written. */
const TEMP_FILE_MODE = 0o600;
/** Committed blobs are read-only: immutability by construction (ADR 0003 decision 1). */
const BLOB_FILE_MODE = 0o444;

export interface PutOptions {
  maxBytes: number;
  signal?: AbortSignal;
  /** Sees the leading bytes (`CONTENT_HEAD_BYTES`) once; a throw refuses the content. */
  inspectHead?: HeadInspector;
}

export interface PutFolderOptions {
  maxTotalBytes: number;
  signal?: AbortSignal;
  /** Per file, with its C1 relative path; a throw refuses the whole folder. */
  inspectFileHead?: (relativePath: string, head: Buffer) => void;
}

/**
 * Content-addressed store under `<data home>/assets` (ADR 0003): bytes stream to a temp name
 * inside the store while sha-256 is computed, then the temp file is linked to
 * `assets/sha256/<first 2 hex>/<hash>`. Linking fails when the name exists, so an existing blob
 * is never replaced or modified; the temp file is always removed.
 */
@Injectable()
export class ContentStore {
  /** `<data home>/assets`; nothing outside it is written by this class. */
  readonly storeRoot: string;
  private readonly tempRoot: string;

  constructor(private readonly dataHome: DataHome) {
    this.storeRoot = dataHome.assets;
    this.tempRoot = join(dataHome.assets, 'tmp');
  }

  /** Absolute blob path for a hash; the hash is validated so it cannot carry a path. */
  blobPath(contentHash: Sha256): string {
    if (!Sha256Schema.safeParse(contentHash).success) throw new UnsafePathError('escapes-root');
    return resolveInside(this.dataHome.root, contentStorePath(contentHash));
  }

  async putStream(source: Readable, options: PutOptions): Promise<HashedContent> {
    await mkdir(this.tempRoot, { recursive: true, mode: STORE_DIRECTORY_MODE });
    const tempPath = resolveInside(this.tempRoot, `${randomUUID()}.part`);
    const hasher = new BoundedHasher(options.maxBytes);
    const head = new HeadCollector(options.inspectHead);
    try {
      await pipeline(
        source,
        async function* hashWhileCopying(chunks: AsyncIterable<unknown>): AsyncGenerator<Buffer> {
          for await (const chunk of chunks) {
            const bytes = chunkToBuffer(chunk);
            head.push(bytes);
            hasher.update(bytes);
            yield bytes;
          }
          head.finish();
        },
        createWriteStream(tempPath, { flags: 'wx', mode: TEMP_FILE_MODE }),
        { signal: options.signal },
      );
      const hashed = hasher.digest();
      await chmod(tempPath, BLOB_FILE_MODE);
      await this.commit(tempPath, hashed.contentHash);
      return hashed;
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  async putBytes(data: Buffer, options: PutOptions): Promise<HashedContent> {
    return this.putStream(Readable.from([data]), options);
  }

  /** CLI import of one file (PRD 5.3): the source is validated, then copied into the store. */
  async putFile(sourcePath: string, options: PutOptions): Promise<HashedContent> {
    const realSource = await assertSafeSourcePath(sourcePath, this.storeRoot);
    return this.putVerifiedFile(realSource, undefined, options);
  }

  /**
   * Folder import: every file becomes a blob, then the canonical manifest becomes the blob named
   * by the version's `contentHash`.
   */
  async putFolder(sourcePath: string, options: PutFolderOptions): Promise<FolderContent> {
    const realSource = await assertSafeSourcePath(sourcePath, this.storeRoot);
    await assertFolder(realSource);
    const files = await listFolderFiles(realSource);
    const { entries, totalBytes } = await buildFolderEntries(files, { maxTotalBytes: options.maxTotalBytes }, (file, remainingBytes) =>
      this.putVerifiedFile(file.absolutePath, file.identity, {
        maxBytes: remainingBytes,
        signal: options.signal,
        inspectHead: headInspectorFor(file, options.inspectFileHead),
      }),
    );
    const folder = folderContentFrom(entries, totalBytes);
    // sha-256 of the same text, so this blob lands at `blobPath(folder.contentHash)`.
    await this.putBytes(Buffer.from(folder.manifestText, 'utf8'), {
      maxBytes: Buffer.byteLength(folder.manifestText, 'utf8'),
      signal: options.signal,
    });
    return folder;
  }

  /**
   * Copies from the handle that was checked, never by reopening the path: a file swapped for a
   * symlink or another file after the `lstat` (here or in the folder walk) is refused.
   */
  private async putVerifiedFile(sourcePath: string, expected: FileIdentity | undefined, options: PutOptions): Promise<HashedContent> {
    const handle = await openRegularFile(sourcePath, expected);
    try {
      return await this.putStream(handle.createReadStream({ autoClose: false }), options);
    } finally {
      await handle.close();
    }
  }

  private async commit(tempPath: string, contentHash: Sha256): Promise<void> {
    const target = this.blobPath(contentHash);
    await mkdir(dirname(target), { recursive: true, mode: STORE_DIRECTORY_MODE });
    try {
      await link(tempPath, target);
    } catch (error) {
      // Same hash means same bytes: the existing blob is kept untouched and the copy discarded.
      if (isErrnoException(error) && error.code === 'EEXIST') return;
      throw error;
    }
  }
}

function headInspectorFor(file: FolderFile, inspectFileHead: PutFolderOptions['inspectFileHead']): HeadInspector | undefined {
  if (inspectFileHead === undefined) return undefined;
  return (head) => inspectFileHead(file.relativePath, head);
}
