import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { SourceNotFoundError, UnsafePathError } from './asset-store.errors';
import { isErrnoException, toAssetStoreError } from './fs-errors';

/** Device and inode of a checked file; bigint, so a large inode number is compared exactly. */
export interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export function identityOf(stats: BigIntStats): FileIdentity {
  return { dev: stats.dev, ino: stats.ino };
}

/**
 * `O_NOFOLLOW` refuses a final symlink; `O_NONBLOCK` keeps a FIFO swapped in after the check from
 * blocking the open (it has no effect on a regular file).
 */
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function openFailure(error: unknown): unknown {
  if (isErrnoException(error) && error.code === 'ELOOP') return new UnsafePathError('not-a-file');
  if (isErrnoException(error) && error.code === 'ENOENT') return new SourceNotFoundError();
  return toAssetStoreError(error);
}

/**
 * Opens a regular file for reading and proves the handle is the file that was checked: `expected`
 * is the identity an earlier `lstat` saw (a folder walk), or one is taken now; the handle is
 * `fstat`ed and its dev and ino must match. A file replaced, or turned into a symlink or special
 * file, between the check and the open is refused instead of read. The caller closes the handle.
 */
export async function openRegularFile(path: string, expected?: FileIdentity): Promise<FileHandle> {
  let identity: FileIdentity;
  let handle: FileHandle;
  try {
    if (expected === undefined) {
      const checked = await lstat(path, { bigint: true });
      if (!checked.isFile()) throw new UnsafePathError('not-a-file');
      identity = identityOf(checked);
    } else {
      identity = expected;
    }
    handle = await open(path, OPEN_FLAGS);
  } catch (error) {
    throw openFailure(error);
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== identity.dev || opened.ino !== identity.ino) throw new UnsafePathError('not-a-file');
    return handle;
  } catch (error) {
    await handle.close();
    throw toAssetStoreError(error);
  }
}
