import { constants, type Stats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { InputFileError, InputFileTooLargeError } from '../errors/cli.errors.js';

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export interface BoundedInputFile {
  /** Option name for messages (`métricas`); the path itself is never echoed. */
  option: string;
  path: string;
  maxBytes: number;
}

async function regularFileStats(option: string, absolutePath: string): Promise<Stats> {
  let stats: Stats;
  try {
    stats = await lstat(absolutePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) throw new InputFileError(option, 'not-found');
    throw error;
  }
  if (stats.isSymbolicLink()) throw new InputFileError(option, 'symlink');
  // Checked before opening, so a FIFO or a device is never opened (an open could block).
  if (!stats.isFile()) throw new InputFileError(option, 'not-a-file');
  return stats;
}

/**
 * Reads an owner-supplied file into memory under a byte cap (SPEC 0006 section 5.3: the CLI reads
 * the CSV "with the same size limit" the api applies). A file whose size is over the cap is refused
 * before it is opened; one that grows while being read is refused as soon as one byte past the cap
 * arrives, so at most `maxBytes + 1` bytes are ever read. Links are refused (also at open, with
 * `O_NOFOLLOW`). Nothing is written; the bytes go to the core handler, which decodes and bounds them.
 */
export async function readBoundedInputFile(input: BoundedInputFile): Promise<Uint8Array<ArrayBuffer>> {
  const absolutePath = resolve(input.path);
  const stats = await regularFileStats(input.option, absolutePath);
  if (stats.size > input.maxBytes) throw new InputFileTooLargeError(input.option, input.maxBytes);

  let handle: FileHandle;
  try {
    handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasErrorCode(error, 'ELOOP')) throw new InputFileError(input.option, 'symlink');
    if (hasErrorCode(error, 'ENOENT')) throw new InputFileError(input.option, 'not-found');
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) throw new InputFileError(input.option, 'not-a-file');
    // A plain `Uint8Array` is backed by an `ArrayBuffer`, the type core's import input declares.
    const buffer = new Uint8Array(input.maxBytes + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > input.maxBytes) throw new InputFileTooLargeError(input.option, input.maxBytes);
    return buffer.subarray(0, filled);
  } finally {
    await handle.close();
  }
}
