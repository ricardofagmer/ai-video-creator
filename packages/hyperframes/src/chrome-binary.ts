import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, open, realpath } from 'node:fs/promises';
import { HyperframesChromeMissingError } from './errors';
import { isInsideFolder } from './inside-folder';

/*
 * The Chrome binary is verified before it runs (SPEC 0008 section 17.6, finding L1, AC 90). The
 * recorded hash in `chrome.json` is compared with the bytes on disk on every render, so a binary
 * swapped by any writer refuses with `chrome-missing`. The file is opened once, without following a
 * link at its path, and the size, the type and the hash all come from that one handle.
 */

export interface RecordedChromeBinary {
  executablePath: string;
  sha256: string;
  sizeBytes: number;
}

/** A link at the path fails the open; a FIFO cannot block it. */
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const CHUNK_BYTES = 1_048_576;

function errorCodeOf(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/** A link where the binary should be is a changed install; any other failure is unreadable. */
function chromeErrorOf(error: unknown): HyperframesChromeMissingError {
  if (error instanceof HyperframesChromeMissingError) return error;
  return new HyperframesChromeMissingError(errorCodeOf(error) === 'ELOOP' ? 'changed' : 'unreadable');
}

/**
 * The sha-256 of exactly `sizeBytes` bytes read from the handle, reading at most `sizeBytes + 1`
 * bytes: a file that grew or shrank since the `fstat` is a changed file.
 */
async function sha256OfHandle(handle: FileHandle, sizeBytes: number): Promise<string> {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(CHUNK_BYTES);
  const limit = sizeBytes + 1;
  let total = 0;
  for (;;) {
    const length = Math.min(CHUNK_BYTES, limit - total);
    if (length <= 0) break;
    const { bytesRead } = await handle.read(buffer, 0, length, total);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  if (total !== sizeBytes) throw new HyperframesChromeMissingError('changed');
  return hash.digest('hex');
}

/** Opens `executablePath` once and hashes it; `expectedSize` defaults to the handle's own size. */
async function hashOpenedBinary(executablePath: string, expectedSize?: number): Promise<{ sha256: string; sizeBytes: number }> {
  const handle = await open(executablePath, OPEN_FLAGS);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new HyperframesChromeMissingError('changed');
    if (expectedSize !== undefined && stats.size !== expectedSize) throw new HyperframesChromeMissingError('changed');
    return { sha256: await sha256OfHandle(handle, stats.size), sizeBytes: stats.size };
  } finally {
    await handle.close();
  }
}

/**
 * Steps 2 to 4 of section 17.6 without the comparison: the sha-256 and size of the regular file at
 * `executablePath`, opened once with `O_NOFOLLOW`. Throws `HyperframesChromeMissingError`
 * (`changed` or `unreadable`) otherwise.
 */
export async function hashChromeBinary(executablePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  try {
    return await hashOpenedBinary(executablePath);
  } catch (error) {
    throw chromeErrorOf(error);
  }
}

/**
 * Section 17.6: the real path of the recorded binary is inside the real `cacheDir`; the path opens
 * once with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`; that handle is a regular file of the recorded
 * size whose sha-256 equals the recorded one. Throws `HyperframesChromeMissingError` (`changed` or
 * `unreadable`) otherwise; the error never carries the path or a hash (K12).
 */
export async function verifyChromeBinary(recorded: RecordedChromeBinary, options: { cacheDir: string }): Promise<void> {
  try {
    const [realCacheDir, realBinary] = await Promise.all([realpath(options.cacheDir), realpath(recorded.executablePath)]);
    if (!isInsideFolder(realCacheDir, realBinary)) throw new HyperframesChromeMissingError('changed');
    const { sha256 } = await hashOpenedBinary(recorded.executablePath, recorded.sizeBytes);
    if (sha256 !== recorded.sha256) throw new HyperframesChromeMissingError('changed');
  } catch (error) {
    throw chromeErrorOf(error);
  }
}
