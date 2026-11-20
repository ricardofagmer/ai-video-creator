import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { hasErrorCode } from '../platform/error-code';

/** Identity of one file version; an atomic rewrite changes the inode, an edit the size or time. */
export interface FileFingerprint {
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
}

export type BoundedRead =
  | { status: 'absent' }
  | { status: 'rejected'; reason: 'not-regular-file' | 'too-large' | 'changed-during-read' }
  | { status: 'unchanged' }
  | { status: 'read'; text: string; fingerprint: FileFingerprint };

export interface BoundedReadOptions {
  readonly maxBytes: number;
  /** When the file still has this fingerprint, it is not read again. */
  readonly previous?: FileFingerprint;
}

async function openReadOnly(filePath: string): Promise<FileHandle | 'absent' | 'link'> {
  try {
    // Read-only by flag. O_NOFOLLOW refuses a file replaced by a link; O_NONBLOCK keeps a FIFO from stalling.
    return await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    if (hasErrorCode(error, 'ELOOP')) return 'link';
    throw error;
  }
}

function sameFingerprint(left: FileFingerprint, right: FileFingerprint): boolean {
  return left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

/**
 * Reads a data-home file without ever opening it for writing. A missing file is `absent`; a link,
 * a non-regular file or one over `maxBytes` is `rejected` before its bytes are read. Other I/O
 * errors (permission) throw, and the caller decides what they mean.
 */
export async function readBoundedText(filePath: string, options: BoundedReadOptions): Promise<BoundedRead> {
  const handle = await openReadOnly(filePath);
  if (handle === 'absent') return { status: 'absent' };
  if (handle === 'link') return { status: 'rejected', reason: 'not-regular-file' };
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return { status: 'rejected', reason: 'not-regular-file' };
    if (stats.size > options.maxBytes) return { status: 'rejected', reason: 'too-large' };
    const fingerprint: FileFingerprint = { ino: stats.ino, size: stats.size, mtimeMs: stats.mtimeMs };
    if (options.previous !== undefined && sameFingerprint(options.previous, fingerprint)) return { status: 'unchanged' };
    const buffer = Buffer.alloc(stats.size + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    // A writer that bypassed the atomic rename grew the file after stat; the next poll reads it again.
    if (filled > stats.size) return { status: 'rejected', reason: 'changed-during-read' };
    return { status: 'read', text: buffer.subarray(0, filled).toString('utf8'), fingerprint };
  } finally {
    await handle.close();
  }
}
