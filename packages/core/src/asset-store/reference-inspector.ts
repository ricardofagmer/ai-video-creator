import { Injectable } from '@nestjs/common';
import { DataHome } from '../paths/data-home';
import { folderContentFrom, type FolderContent } from './folder-content';
import { assertFolder, buildFolderEntries, listFolderFiles } from './folder-walk';
import { hashRegularFile, type HashedContent } from './hashing';
import { assertSafeSourcePath } from './path-guards';

export interface InspectOptions {
  maxBytes: number;
  signal?: AbortSignal;
}

/**
 * Registration by reference (ADR 0003 decision 2, PRD 12): reads the target only to hash it and
 * measure it. It has no write path at all: no `mkdir`, no temp file, nothing under `assets/`,
 * which is what keeps biometric material out of the store (criterion 22).
 */
@Injectable()
export class ReferenceInspector {
  constructor(private readonly dataHome: DataHome) {}

  async inspectFile(absolutePath: string, options: InspectOptions): Promise<HashedContent> {
    const realPath = await assertSafeSourcePath(absolutePath, this.dataHome.assets);
    // Checked and read through one handle: a swap after the check is refused (`openRegularFile`).
    return hashRegularFile(realPath, options);
  }

  async inspectFolder(absolutePath: string, options: InspectOptions): Promise<FolderContent> {
    const realPath = await assertSafeSourcePath(absolutePath, this.dataHome.assets);
    await assertFolder(realPath);
    const files = await listFolderFiles(realPath);
    const { entries, totalBytes } = await buildFolderEntries(files, { maxTotalBytes: options.maxBytes }, (file, remainingBytes) =>
      hashRegularFile(file.absolutePath, { maxBytes: remainingBytes, signal: options.signal }, file.identity),
    );
    return folderContentFrom(entries, totalBytes);
  }
}
