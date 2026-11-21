import { performance } from 'node:perf_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { tokenLockBounds, type Platform } from '@studio/shared/platforms';
import { acquireTokenLock, holdsTokenLock, releaseTokenLock } from '@studio/shared/platforms/files';
import { TokenVaultUnavailableError } from './platforms.errors';
import { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, PLATFORM_PROCESS_ID, type PlatformClock } from './platform-runtime';

/**
 * What the holder of `token.lock` may do under it (findings S1, C5). Every platform call and
 * Keychain command runs through `bounded`, so all of them end within
 * `tokenLockBounds.operationBudgetMs` of the acquisition, well before the lock turns stale; every
 * Keychain write is preceded by `assertHeld`.
 */
export interface TokenLease {
  readonly platform: Platform;
  /**
   * Runs one call with the budget left, minus `reserveMs` kept for the calls that must follow (the
   * delete after a revoke). The call receives that time as its own timeout, so a Keychain command
   * is killed rather than left running after the lock is released. Past the budget it waits, at most
   * `LATE_SETTLE_GRACE_MS`, for the call to settle (finding F-2), then rejects with
   * `TokenVaultUnavailableError` / `lock` / `timeout`; the call's late result is dropped.
   */
  bounded<Result>(call: (timeoutMs: number) => Promise<Result>, options?: { reserveMs?: number }): Promise<Result>;
  /** Refuses with `keychain-unavailable` / `lock-held` unless this process still holds a live lock. */
  assertHeld(): Promise<void>;
}

/**
 * `token.lock` around a Keychain write or delete (SPEC 0007 section 5.2): the api and the CLI hold
 * it for connect and disconnect, the watcher for refresh plus write. A lock another live process
 * holds refuses at once with `keychain-unavailable` / `lock-held`; the caller's owner retries.
 * The lock is released in `finally`, whatever the work threw.
 */
@Injectable()
export class TokenLock {
  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    @Inject(PLATFORM_PROCESS_ID) private readonly pid: number,
  ) {}

  async withLock<Result>(platform: Platform, work: (lease: TokenLease) => Promise<Result>): Promise<Result> {
    const acquired = await acquireTokenLock({
      platformRoot: this.platformRoot,
      platform,
      pid: this.pid,
      nowMs: this.clock.now().getTime(),
    });
    if (acquired.state === 'held') throw new TokenVaultUnavailableError(platform, 'lock', 'lock-held');
    // A monotonic deadline: the budget must hold even when the wall clock jumps.
    const deadline = performance.now() + tokenLockBounds.operationBudgetMs;
    try {
      return await work(this.leaseFor(platform, deadline));
    } finally {
      await releaseTokenLock({ platformRoot: this.platformRoot, platform, pid: this.pid });
    }
  }

  private leaseFor(platform: Platform, deadline: number): TokenLease {
    return {
      platform,
      bounded: (call, options) => boundedCall({ platform, deadline, reserveMs: options?.reserveMs ?? 0, call }),
      assertHeld: async () => {
        const held = await holdsTokenLock({
          platformRoot: this.platformRoot,
          platform,
          pid: this.pid,
          nowMs: this.clock.now().getTime(),
        });
        if (!held) throw new TokenVaultUnavailableError(platform, 'lock', 'lock-held');
      },
    };
  }
}

/** Marks the lease timer winning the race against the call. */
const EXPIRED = Symbol('expired');

/**
 * Finding F-2: after the budget runs out, how long `bounded` still waits for the call to settle
 * before it gives control back, so the caller does not release the lock while a killed Keychain
 * command may still be running. Longer than the vault's own wait for a killed child's exit, and far
 * shorter than the gap between `operationBudgetMs` and `staleMs`.
 */
export const LATE_SETTLE_GRACE_MS = 500;

async function boundedCall<Result>(options: {
  platform: Platform;
  deadline: number;
  reserveMs: number;
  call: (timeoutMs: number) => Promise<Result>;
}): Promise<Result> {
  const timeoutMs = Math.floor(options.deadline - performance.now() - options.reserveMs);
  if (timeoutMs <= 0) throw new TokenVaultUnavailableError(options.platform, 'lock', 'timeout');
  const pending = options.call(timeoutMs);
  // Observed here so a late rejection after the timeout never surfaces as unhandled.
  const settled = pending.then(
    () => undefined,
    () => undefined,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<typeof EXPIRED>((resolve) => {
    timer = setTimeout(() => resolve(EXPIRED), timeoutMs);
  });
  try {
    const first = await Promise.race([pending, expired]);
    if (first !== EXPIRED) return first;
  } finally {
    clearTimeout(timer);
  }
  await settleWithin(settled, LATE_SETTLE_GRACE_MS);
  // The call's late result is dropped: past the budget the lock may no longer be ours.
  throw new TokenVaultUnavailableError(options.platform, 'lock', 'timeout');
}

/** Waits for `settled`, but never longer than `graceMs`. */
async function settleWithin(settled: Promise<void>, graceMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const graceOver = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, graceMs);
  });
  try {
    await Promise.race([settled, graceOver]);
  } finally {
    clearTimeout(timer);
  }
}
