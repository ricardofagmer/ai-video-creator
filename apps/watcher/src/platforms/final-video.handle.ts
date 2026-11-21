import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { hasErrorCode } from '../platform/error-code';

/** `opened`: the handle's bytes hash to the expected value; the caller sends them and closes it. */
export type OpenedVideo = { status: 'opened'; file: FileHandle; sha256: string } | { status: 'missing' } | { status: 'changed' };

/** Positional reads of 1 MiB, so a 4 GiB video never sits in memory. */
const HASH_CHUNK_BYTES = 1_048_576;

/**
 * The bytes the hash is taken from are the bytes the upload sends (finding S2). Positional reads
 * leave the file position at 0, where the client starts.
 */
async function sha256OfHandle(file: FileHandle, sizeBytes: number): Promise<string | null> {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
  let position = 0;
  for (;;) {
    const { bytesRead } = await file.read(buffer, 0, HASH_CHUNK_BYTES, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
    // A file that grew while it was hashed is not the file the request names.
    if (position > sizeBytes) return null;
  }
  return position === sizeBytes ? hash.digest('hex') : null;
}

async function openNoFollow(absolutePath: string): Promise<FileHandle | 'missing' | 'changed'> {
  try {
    // O_NONBLOCK so a FIFO swapped in at the path cannot hang the open; reads of a regular file ignore it.
    return await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'missing';
    // A symlink put in place of `final.mp4` after its path was resolved inside the run.
    if (hasErrorCode(error, 'ELOOP')) return 'changed';
    throw error;
  }
}

/**
 * Opens `final.mp4` once (SPEC 0007 section 5.5 re-check 4, finding S2): O_RDONLY | O_NOFOLLOW,
 * fstat on the handle (a regular file of exactly the request's size), then the sha-256 from that
 * same handle, compared with the request's hash. Any refusal closes the handle before returning.
 */
export async function openVerifiedVideo(absolutePath: string, expected: { sizeBytes: number; sha256: string }): Promise<OpenedVideo> {
  const opened = await openNoFollow(absolutePath);
  if (opened === 'missing' || opened === 'changed') return { status: opened };
  let keep = false;
  try {
    const stats = await opened.stat();
    if (!stats.isFile() || stats.size !== expected.sizeBytes) return { status: 'changed' };
    const sha256 = await sha256OfHandle(opened, expected.sizeBytes);
    if (sha256 === null || sha256 !== expected.sha256) return { status: 'changed' };
    keep = true;
    return { status: 'opened', file: opened, sha256 };
  } finally {
    if (!keep) await opened.close();
  }
}
