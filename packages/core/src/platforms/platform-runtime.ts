import { type IsoDate } from '@studio/shared/metrics';

/*
 * Injected runtime facts of the platform module (rules/architecture.md: inject the clock): the
 * clock, the `<data home>/platform/` root and this process's pid. Tests bind fixed values.
 */

/** The time source every platform handler and store reads. */
export interface PlatformClock {
  now(): Date;
}

export const PLATFORM_CLOCK = Symbol('PLATFORM_CLOCK');

export const systemPlatformClock: PlatformClock = { now: () => new Date() };

/** Nest token for the absolute `<data home>/platform/` folder (`DataHome.platform`). */
export const PLATFORM_FILE_ROOT = Symbol('PLATFORM_FILE_ROOT');

/** Nest token for the pid written into `token.lock` (the process's own pid in production). */
export const PLATFORM_PROCESS_ID = Symbol('PLATFORM_PROCESS_ID');

/** The local calendar day of `instant` on this Mac, `YYYY-MM-DD` (the studio's day, SPEC 0006 L9). */
export function localDateOf(instant: Date): IsoDate {
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${instant.getFullYear()}-${month}-${day}`;
}
