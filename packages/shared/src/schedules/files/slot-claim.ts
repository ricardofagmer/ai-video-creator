import { constants } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { RunFileWriteError, hasErrorCode } from '../../run-files/errors';
import { slotClaimPath, type ScheduleLocation } from './paths';

/*
 * Per-slot fire claims (SPEC 0006 section 4.6, R3 security re-review): the watcher creates
 * `schedules/<id>/fired/<slotMs>` with O_EXCL after the guards pass and before it writes the
 * run. `fire.lock` keeps two daemons apart; the claim is what makes a double fire impossible
 * when the lock is ever bypassed (a crash inside a takeover, a holder suspended past `staleMs`).
 */

const CLAIMS_FOLDER_MODE = 0o700;
const CLAIM_FILE_MODE = 0o600;
const MAX_CLAIM_BYTES = 64;

/** `claimed`: this process may write the slot's run. `taken`: a claim already exists. */
export type SlotClaimResult = 'claimed' | 'taken';

export async function claimSlot(location: ScheduleLocation, slotAt: Date, pid: number): Promise<SlotClaimResult> {
  const claimPath = slotClaimPath(location, slotAt);
  await mkdir(dirname(claimPath), { recursive: true, mode: CLAIMS_FOLDER_MODE });
  let handle;
  try {
    handle = await open(claimPath, 'wx', CLAIM_FILE_MODE);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return 'taken';
    throw new RunFileWriteError(claimPath, { cause: error });
  }
  try {
    await handle.writeFile(`${pid}\n`, { encoding: 'utf8' });
  } finally {
    await handle.close();
  }
  return 'claimed';
}

async function claimOwner(claimPath: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(claimPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ELOOP')) return null;
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_CLAIM_BYTES) return null;
    return (await handle.readFile({ encoding: 'utf8' })).trim();
  } finally {
    await handle.close();
  }
}

/**
 * Gives a claim back after this process's run write failed, so the next evaluation can fire the
 * slot. A claim that names another pid is never removed.
 */
export async function releaseSlotClaim(location: ScheduleLocation, slotAt: Date, pid: number): Promise<void> {
  const claimPath = slotClaimPath(location, slotAt);
  if ((await claimOwner(claimPath)) !== String(pid)) return;
  try {
    await unlink(claimPath);
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw new RunFileWriteError(claimPath, { cause: error });
  }
}
