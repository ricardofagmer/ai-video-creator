import { uptime } from 'node:os';
import { hasErrorCode } from './errors';

/*
 * Liveness of a process this user started (SPEC 0007 section 5.5, review finding C1). A bare pid is
 * not an identity: after a reboot the pid of a dead watcher can belong to any new process. Files
 * that name an owner therefore also record the machine's boot time, and an owner recorded under
 * another boot is gone whatever its pid answers. Owners of these files always run as the same user,
 * so EPERM (a process of another user) means the owner is gone too.
 */

/**
 * Boot times derived from `Date.now() - uptime` drift with clock adjustments; two boots are always
 * further apart than this.
 */
export const BOOT_TIME_TOLERANCE_MS = 60_000;

/** The machine's boot time in epoch milliseconds, rounded to the second. */
export function currentBootTimeMs(nowMs: number = Date.now()): number {
  return Math.round((nowMs - uptime() * 1000) / 1000) * 1000;
}

/** Whether a recorded boot time is this boot; null (a file written before the field existed) never is. */
export function isSameBoot(recordedBootTimeMs: number | null, bootTimeMs: number = currentBootTimeMs()): boolean {
  return recordedBootTimeMs !== null && Math.abs(recordedBootTimeMs - bootTimeMs) <= BOOT_TIME_TOLERANCE_MS;
}

/** Signal 0 for a process this user owns: ESRCH and EPERM both mean it is not ours any more. */
export function isOwnProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH') || hasErrorCode(error, 'EPERM')) return false;
    throw error;
  }
}

/** The owner a file records: its pid and the boot it ran under. */
export interface ProcessStamp {
  pid: number;
  /** Null when the file was written before boot times were recorded. */
  bootTimeMs: number | null;
}

/** `<pid> <bootTimeMs>\n`. */
export function formatProcessStamp(pid: number, bootTimeMs: number = currentBootTimeMs()): string {
  return `${pid} ${bootTimeMs}\n`;
}

/** Parses `<pid>` (older files) or `<pid> <bootTimeMs>`; null for anything else. */
export function parseProcessStamp(text: string): ProcessStamp | null {
  const match = /^([1-9][0-9]{0,6})(?: ([1-9][0-9]{9,14}))?$/.exec(text.trim());
  if (match === null) return null;
  const [, pidText, bootText] = match;
  if (pidText === undefined) return null;
  return { pid: Number.parseInt(pidText, 10), bootTimeMs: bootText === undefined ? null : Number.parseInt(bootText, 10) };
}

/**
 * Whether the recorded owner still runs: same boot, a live process of this user, and not `selfPid`
 * (a process that finds its own pid in a file it did not write in this life sees a reused pid).
 */
export function isStampAlive(stamp: ProcessStamp, options: { selfPid?: number; bootTimeMs?: number } = {}): boolean {
  if (options.selfPid !== undefined && stamp.pid === options.selfPid) return false;
  if (!isSameBoot(stamp.bootTimeMs, options.bootTimeMs)) return false;
  return isOwnProcessAlive(stamp.pid);
}
