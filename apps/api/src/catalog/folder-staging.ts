import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_FOLDER_FILES } from '@studio/core/asset-store';
import { RelativePathSchema } from '@studio/shared/catalog';
import { UploadRejectedError } from '../platform/api.errors';

/** Owner-only, like the data home: staged files may be unpublished drafts of the owner's work. */
const STAGING_DIRECTORY_MODE = 0o700;
const STAGING_FILE_MODE = 0o600;

function hasErrorCode(error: unknown, codes: readonly string[]): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && codes.includes(error.code);
}

/**
 * A private temporary folder that receives the files of a folder upload, so the catalog's own
 * folder import (R1-05: canonical file list, per-kind size cap, symlink refusal) stores them.
 * Every name is a C1 relative path joined under the staging root; nothing is written outside it.
 * The caller always calls `dispose()`.
 */
export class FolderStaging {
  private readonly relativePaths: string[] = [];
  private totalBytes = 0;

  private constructor(
    private readonly root: string,
    private readonly maxTotalBytes: number,
  ) {}

  static async create(maxTotalBytes: number): Promise<FolderStaging> {
    const created = await mkdtemp(join(tmpdir(), 'studio-upload-'));
    // The catalog refuses non-normalized or symlinked sources; macOS tmpdir sits under a symlink.
    return new FolderStaging(await realpath(created), maxTotalBytes);
  }

  isEmpty(): boolean {
    return this.relativePaths.length === 0;
  }

  async add(relativePath: string, stream: Readable): Promise<void> {
    if (!RelativePathSchema.safeParse(relativePath).success) throw new UploadRejectedError('invalid-file-path');
    if (this.relativePaths.length >= MAX_FOLDER_FILES) throw new UploadRejectedError('too-many-parts');
    const target = resolve(this.root, relativePath);
    if (!target.startsWith(`${this.root}${sep}`)) throw new UploadRejectedError('invalid-file-path');

    try {
      await mkdir(dirname(target), { recursive: true, mode: STAGING_DIRECTORY_MODE });
      await pipeline(
        stream,
        (chunks: AsyncIterable<unknown>) => this.countBytes(chunks),
        createWriteStream(target, { flags: 'wx', mode: STAGING_FILE_MODE }),
      );
    } catch (error) {
      // A repeated name, or a file where a folder of the same name is needed.
      if (hasErrorCode(error, ['EEXIST', 'ENOTDIR', 'EISDIR'])) throw new UploadRejectedError('duplicate-file');
      throw error;
    }
    this.relativePaths.push(relativePath);
  }

  /** Bounds the whole folder upload; the catalog applies the stricter per-kind cap on import. */
  private async *countBytes(chunks: AsyncIterable<unknown>): AsyncGenerator<Buffer> {
    for await (const chunk of chunks) {
      if (!Buffer.isBuffer(chunk)) throw new UploadRejectedError('malformed');
      this.totalBytes += chunk.length;
      if (this.totalBytes > this.maxTotalBytes) throw new UploadRejectedError('file-too-large');
      yield chunk;
    }
  }

  /**
   * The folder to import: the shared top folder when every file sits under the same one (a
   * dragged folder arrives as `name/...`), otherwise the staging root.
   */
  importRoot(): string {
    const firstSegments = new Set(this.relativePaths.map((path) => path.split('/')[0]));
    const [onlyTop] = [...firstSegments];
    const everyFileNested = this.relativePaths.every((path) => path.includes('/'));
    return firstSegments.size === 1 && everyFileNested && onlyTop !== undefined ? join(this.root, onlyTop) : this.root;
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
