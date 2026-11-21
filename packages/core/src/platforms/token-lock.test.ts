import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { tokenLockBounds } from '@studio/shared/platforms';
import { accountFilePath } from '@studio/shared/platforms/files';
import { MutableClock } from './platform-harness.harness.test';
import { TokenVaultUnavailableError } from './platforms.errors';
import { LATE_SETTLE_GRACE_MS, TokenLock } from './token-lock';

/*
 * `TokenLock` and its lease (SPEC 0007 section 5.2, findings S1 and C5): every call under the lock
 * gets the time left of `tokenLockBounds.operationBudgetMs`, a call past the budget is cut off with
 * keychain-unavailable / lock / timeout, and `assertHeld` refuses once this process no longer holds
 * a live lock. A throwaway platform folder under os.tmpdir(); the parent of the test process
 * stands in for another live process.
 */

let root: string;
let platformRoot: string;
let clock: MutableClock;

function timedOut(error: unknown): boolean {
  return error instanceof TokenVaultUnavailableError && error.operation === 'lock' && error.failure === 'timeout';
}

function lockHeld(error: unknown): boolean {
  return error instanceof TokenVaultUnavailableError && error.failure === 'lock-held';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** One macrotask turn: every promise chain queued so far has run. `setImmediate` is never mocked here. */
function flushPromiseChains(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function lockPath(): string {
  return accountFilePath(platformRoot, 'youtube', 'tokenLock');
}

describe('TokenLock lease (S1, C5)', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(await realpath(tmpdir()), 'studio-core-token-lease-'));
    platformRoot = join(root, 'platform');
    await mkdir(platformRoot);
    // The real time: lock files carry real mtimes, so the clock must agree with them.
    clock = new MutableClock(new Date());
  });

  afterEach(async () => {
    mock.timers.reset();
    await rm(root, { recursive: true, force: true });
  });

  it('gives each call a positive timeout within the budget, shortened by the reserve', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);
    const seen: number[] = [];

    await tokenLock.withLock('youtube', async (lease) => {
      await lease.bounded(async (timeoutMs) => {
        seen.push(timeoutMs);
      });
      await lease.bounded(
        async (timeoutMs) => {
          seen.push(timeoutMs);
        },
        { reserveMs: 20_000 },
      );
    });

    const [plain, reserved] = seen;
    assert.ok(plain !== undefined && plain > 0 && plain <= tokenLockBounds.operationBudgetMs);
    assert.ok(reserved !== undefined && reserved > 0 && reserved <= tokenLockBounds.operationBudgetMs - 20_000);
  });

  it('refuses a call whose reserve leaves no budget, without running it', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);
    let ran = false;

    await assert.rejects(
      tokenLock.withLock('youtube', (lease) =>
        lease.bounded(
          async () => {
            ran = true;
          },
          { reserveMs: tokenLockBounds.operationBudgetMs + 1 },
        ),
      ),
      timedOut,
    );
    assert.equal(ran, false);
  });

  it('cuts off a call that outlives the budget and its settle grace, and releases the lock afterwards', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);

    await assert.rejects(
      tokenLock.withLock('youtube', async (lease) => {
        mock.timers.enable({ apis: ['setTimeout'] });
        try {
          const never = lease.bounded(() => new Promise<never>(() => undefined));
          // Rejections are observed at once; the assertion below is the real check.
          never.catch(() => undefined);
          mock.timers.tick(tokenLockBounds.operationBudgetMs);
          // The settle grace timer is armed only after the budget timer's promise chain has run.
          await flushPromiseChains();
          mock.timers.tick(LATE_SETTLE_GRACE_MS);
          await never;
        } finally {
          mock.timers.reset();
        }
      }),
      timedOut,
    );
    await assert.rejects(stat(lockPath()), { code: 'ENOENT' });
  });

  it('waits for a call that settles after its timeout before giving control back, so the lock is still held (F-2)', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);
    let settled = false;
    let lockPresentWhenSettled = false;

    await assert.rejects(
      tokenLock.withLock('youtube', (lease) =>
        lease.bounded(
          async (timeoutMs) => {
            // A Keychain command killed at its timeout that takes a moment to exit.
            await delay(timeoutMs + LATE_SETTLE_GRACE_MS / 5);
            lockPresentWhenSettled = (await stat(lockPath())).isFile();
            settled = true;
          },
          { reserveMs: tokenLockBounds.operationBudgetMs - 300 },
        ),
      ),
      timedOut,
    );
    assert.equal(settled, true, 'bounded returned only after the call settled');
    assert.equal(lockPresentWhenSettled, true, 'the lock was not released while the call still ran');
    await assert.rejects(stat(lockPath()), { code: 'ENOENT' });
  });

  it('passes assertHeld while this process holds a fresh lock', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);
    await tokenLock.withLock('youtube', (lease) => lease.assertHeld());
  });

  it('refuses assertHeld once another process took the lock over', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);

    await assert.rejects(
      tokenLock.withLock('youtube', async (lease) => {
        await writeFile(lockPath(), `${process.ppid}\n`);
        await lease.assertHeld();
      }),
      lockHeld,
    );
    assert.ok((await stat(lockPath())).isFile(), 'the other owner keeps its lock');
  });

  it('refuses assertHeld once the lock went stale', async () => {
    const tokenLock = new TokenLock(platformRoot, clock, process.pid);

    await assert.rejects(
      tokenLock.withLock('youtube', async (lease) => {
        clock.advance(tokenLockBounds.staleMs + 5_000);
        await lease.assertHeld();
      }),
      lockHeld,
    );
  });

  it('refuses at once, running nothing, while another live process holds the lock', async () => {
    await new TokenLock(platformRoot, clock, process.ppid).withLock('youtube', async () => {
      let ran = false;
      await assert.rejects(
        new TokenLock(platformRoot, clock, process.pid).withLock('youtube', async () => {
          ran = true;
        }),
        lockHeld,
      );
      assert.equal(ran, false);
    });
  });
});
