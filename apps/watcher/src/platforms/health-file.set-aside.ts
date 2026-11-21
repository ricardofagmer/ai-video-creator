import { constants } from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { type Platform } from '@studio/shared/platforms';
import { accountFilePath } from '@studio/shared/platforms/files';
import { hasErrorCode } from '../platform/error-code';

/** Files under `platform/` are owner-only (SPEC 0007 section 4.6), the moved-aside one included. */
const OWNER_ONLY_MODE = 0o600;

/** `accounts/<platform>/health.json.corrupt`: the last unreadable health file, kept for diagnosis only. */
export function corruptHealthFilePath(platformRoot: string, platform: Platform): string {
  return `${accountFilePath(platformRoot, platform, 'health')}.corrupt`;
}

/**
 * What the move did: `moved` (the file is aside, owner-only), `absent` (no `health.json` to move), or
 * `moved-mode-unchanged` (the file is aside, so the next read finds none, but narrowing its mode
 * failed; `error` is that failure, used for its class name only).
 */
export type SetAsideResult = { status: 'moved' } | { status: 'absent' } | { status: 'moved-mode-unchanged'; error: unknown };

/**
 * Finding R7 recovery: moves an unreadable `health.json` aside so the next read finds no health file.
 * rename(2) is atomic within the account folder and replaces an older `.corrupt` file in the same
 * step, so readers see the corrupt file or none, never a half state. A file already gone is fine.
 * The watcher is the only writer of `health.json` (AC 57) and its writes are awaited one after
 * another in the daemon loop, so no watcher write of this file runs between the failed read and
 * this rename. Only a failed rename throws: once the rename landed the recovery is done, so a chmod
 * failure after it is `moved-mode-unchanged`, never a failed move (round 4 nit).
 */
export async function setAsideCorruptHealthFile(platformRoot: string, platform: Platform): Promise<SetAsideResult> {
  const asidePath = corruptHealthFilePath(platformRoot, platform);
  try {
    await rename(accountFilePath(platformRoot, platform, 'health'), asidePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { status: 'absent' };
    throw error;
  }
  try {
    await restrictToOwner(asidePath);
  } catch (error) {
    return { status: 'moved-mode-unchanged', error };
  }
  return { status: 'moved' };
}

/**
 * rename keeps the moved file's mode; a file not written by the shared atomic helper may be wider
 * than `0600`. The handle is opened without following a link or blocking on a FIFO, and only a
 * regular file is narrowed.
 */
async function restrictToOwner(filePath: string): Promise<void> {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ELOOP') || hasErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  try {
    if ((await handle.stat()).isFile()) await handle.chmod(OWNER_ONLY_MODE);
  } finally {
    await handle.close();
  }
}
