import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { HealthReader, LATE_SETTLE_GRACE_MS, PlatformClientError, SecretToken, type TokenBundle } from '@studio/core/platforms';
import { tokenLockBounds } from '@studio/shared/platforms';
import { accountFilePath, acquireTokenLock, writeHealthFile } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { corruptHealthFilePath } from './health-file.set-aside';
import { DAY_MS, SENTINEL_ACCESS_TOKEN, connectAccount } from './platform-fixtures.harness.test';
import { createPlatformHarness, type PlatformHarness } from './platform-step.harness.test';

/*
 * The watcher's token handling in live mode (SPEC 0007 section 5.2, AC 42, AC 43): the refresh runs
 * under `token.lock`, `account.json` is read again after the lock and after the platform answered,
 * and nothing is written when the account was disconnected or reconnected meanwhile. The Keychain
 * is `InMemoryPlatformTokenVault`; the test plays the api where it writes `account.json`.
 */

const SEED_ACCESS = 'seed-access-value-for-tests';
/** A pid no test ever signals: `process.kill` is replaced wherever a lock names it. */
const OTHER_OWNER_PID = 4_242_424;

/** `WRITE_RESERVE_MS` of the session: the share of the lock budget the refresh leaves for the Keychain write. */
const WRITE_RESERVE_MS = 5_000;
const MONOTONIC_START_MS = 1_000;

/**
 * Replaces `performance.now`, which the core `TokenLock` lease uses for its one deadline, with a
 * monotonic clock the test moves; fails closed when the stub is not what the lease reads.
 */
function installMonotonicClock(): { nowMs: number } {
  const monotonic = { nowMs: MONOTONIC_START_MS };
  const now = mock.method(performance, 'now', (): number => monotonic.nowMs);
  assert.equal(performance.now, now, 'performance.now is the stub');
  assert.equal(performance.now(), MONOTONIC_START_MS);
  return monotonic;
}

/** Lets pending file I/O callbacks run; `setImmediate` is never among the mocked timers. */
async function flushIo(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Replaces `process.kill` so `OTHER_OWNER_PID` answers as a live process of this user and every
 * other pid as gone; fails closed when the replacement is not the installed function.
 */
function stubOtherOwnerAlive(): void {
  const kill = mock.method(process, 'kill', (pid: number): true => {
    if (pid === OTHER_OWNER_PID) return true;
    throw Object.assign(new Error(`kill ${pid}: ESRCH`), { code: 'ESRCH' });
  });
  assert.equal(process.kill, kill, 'process.kill is the stub before any lock is read');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('PlatformTokenSession (AC 42, AC 43)', () => {
  let harness: PlatformHarness;
  let connectionId: string;
  let lockPath: string;
  let baseline: { reads: number; writes: number; deletes: number };

  beforeEach(async () => {
    harness = await createPlatformHarness({ modes: { youtube: { mode: 'live' } } });
    const now = harness.clock.now();
    connectionId = newUlid(now.getTime() - DAY_MS);
    lockPath = accountFilePath(harness.platformRoot, 'youtube', 'tokenLock');
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: now, mode: 'live' });
    const seed: TokenBundle = {
      format: 1,
      platform: 'youtube',
      connectionId,
      accessToken: new SecretToken(SEED_ACCESS),
      // Inside the 5-minute margin, so the next use refreshes.
      accessExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      refreshToken: new SecretToken('seed-refresh-value-for-tests'),
      refreshExpiresAt: null,
      scopes: [],
      obtainedAt: now.toISOString(),
    };
    await harness.vault.write(seed);
    baseline = harness.vault.operationCounts();
  });

  afterEach(async () => {
    mock.restoreAll();
    mock.timers.reset();
    await harness.close();
  });

  /** `token.lock`'s age is judged against the injected clock: give the lock this clock's mtime. */
  async function alignLockAge(): Promise<void> {
    await utimes(lockPath, harness.clock.now(), harness.clock.now());
  }

  async function storedAccessToken(): Promise<string | null> {
    const lookup = await harness.vault.read('youtube');
    return lookup.status === 'found' ? lookup.bundle.accessToken.revealForPlatformCall() : null;
  }

  function vaultWritesSinceSeed(): number {
    return harness.vault.operationCounts().writes - baseline.writes;
  }

  it('refreshes under token.lock, replaces the Keychain item and releases the lock', async () => {
    const lockHeldDuringRefresh: boolean[] = [];
    harness.clients.youtube.onRefresh = async () => {
      lockHeldDuringRefresh.push(await exists(lockPath));
      await alignLockAge();
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(acquisition.status, 'ready');
    assert.deepEqual(lockHeldDuringRefresh, [true]);
    assert.equal(vaultWritesSinceSeed(), 1);
    assert.equal(await storedAccessToken(), SENTINEL_ACCESS_TOKEN);
    assert.equal(await exists(lockPath), false);
  });

  it('re-reads account.json after taking token.lock and writes nothing when it says disconnected', async () => {
    // The api's disconnect completes after the watcher's first read and before its lock.
    harness.credentials.beforeLookup = async () => {
      await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), state: 'disconnected', mode: 'live' });
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'disconnected' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(vaultWritesSinceSeed(), 0);
  });

  it('does not refresh while another process holds token.lock', async () => {
    stubOtherOwnerAlive();
    harness.credentials.beforeLookup = async () => {
      const held = await acquireTokenLock({ platformRoot: harness.platformRoot, platform: 'youtube', pid: OTHER_OWNER_PID, nowMs: harness.clock.now().getTime() });
      assert.equal(held.state, 'acquired');
      // Age the lock by the injected clock, not the wall clock, so it is fresh for the watcher.
      await utimes(lockPath, harness.clock.now(), harness.clock.now());
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'lock-held' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(vaultWritesSinceSeed(), 0);
  });

  it('drops the refreshed token and writes nothing when connectionId changed while the platform answered', async () => {
    harness.clients.youtube.onRefresh = async () => {
      await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: newUlid(harness.clock.now().getTime()), at: harness.clock.now(), mode: 'live' });
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(acquisition.status, 'blocked');
    assert.equal(vaultWritesSinceSeed(), 0);
    assert.equal(await storedAccessToken(), SEED_ACCESS);
  });

  it('leaves no Keychain item when a disconnect races the refresh', async () => {
    harness.clients.youtube.onRefresh = async () => {
      await harness.vault.delete('youtube');
      await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), state: 'disconnected', mode: 'live' });
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'disconnected' });
    assert.equal(harness.vault.has('youtube'), false);
    assert.equal(vaultWritesSinceSeed(), 0);
  });

  it('makes no call and reads no token for a platform that is disconnected', async () => {
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), state: 'disconnected', mode: 'live' });

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'disconnected' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(harness.vault.operationCounts().reads, baseline.reads);
  });

  it('writes needs-reconnect on a refused refresh, keeps the Keychain item and calls nothing more (AC 43)', async () => {
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'token-revoked'));

    const first = await harness.tokens.acquire('youtube', connectionId);
    const second = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(first, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.deepEqual(second, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.equal(harness.clients.youtube.calls.refresh, 1);
    const health = await new HealthReader(harness.platformRoot).read('youtube');
    assert.equal(health?.token, 'needs-reconnect');
    assert.equal(health?.reconnectReason, 'token-revoked');
    assert.equal(health?.connectionId, connectionId);
    assert.equal(harness.vault.has('youtube'), true);
    assert.equal(harness.vault.operationCounts().deletes, baseline.deletes);
  });

  it('passes a 429 during a refresh to the caller and writes no needs-reconnect', async () => {
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'rate-limited'));

    await assert.rejects(harness.tokens.acquire('youtube', connectionId), PlatformClientError);

    assert.equal(await new HealthReader(harness.platformRoot).read('youtube'), null);
    assert.equal(await exists(lockPath), false, 'the lock is released whatever the refresh threw');
  });

  it('writes nothing to the Keychain when token.lock was removed as stale while the platform answered (finding C5)', async () => {
    harness.clients.youtube.onRefresh = async () => {
      await rm(lockPath);
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'lock-held' });
    assert.equal(vaultWritesSinceSeed(), 0);
    assert.equal(await storedAccessToken(), SEED_ACCESS);
  });

  it('writes nothing and leaves the new owner\'s lock when another process took token.lock over (finding C5)', async () => {
    stubOtherOwnerAlive();
    harness.clients.youtube.onRefresh = async () => {
      await rm(lockPath);
      await writeFile(lockPath, `${OTHER_OWNER_PID}\n`);
      await alignLockAge();
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'lock-held' });
    assert.equal(vaultWritesSinceSeed(), 0);
    assert.equal(await storedAccessToken(), SEED_ACCESS);
    assert.equal(await exists(lockPath), true, 'the release never removes another owner\'s lock');
  });

  it('fails a refresh that outlasts the lock budget minus the write reserve as network, writes nothing and releases the lock (finding C5)', async () => {
    // A fixed monotonic clock: the lease deadline is exactly operationBudgetMs after acquisition.
    installMonotonicClock();
    let markStarted: () => void = () => undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    harness.clients.youtube.onRefresh = () => {
      markStarted();
      return new Promise<void>(() => undefined);
    };
    mock.timers.enable({ apis: ['setTimeout'] });
    let settled = false;

    const pending = harness.tokens.acquire('youtube', connectionId).finally(() => {
      settled = true;
    });
    await refreshStarted;
    const refreshBudgetMs = tokenLockBounds.operationBudgetMs - WRITE_RESERVE_MS;
    mock.timers.tick(refreshBudgetMs - 1);
    await flushIo();
    assert.equal(settled, false, 'still waiting just before the refresh budget');
    mock.timers.tick(1);
    // Finding F-2: after its timeout `lease.bounded` waits up to this grace for the refresh to settle.
    await flushIo();
    mock.timers.tick(LATE_SETTLE_GRACE_MS);

    await assert.rejects(pending, (error: unknown) => error instanceof PlatformClientError && error.operation === 'refresh' && error.reason === 'network');
    assert.equal(vaultWritesSinceSeed(), 0);
    assert.equal(await storedAccessToken(), SEED_ACCESS);
    assert.equal(await exists(lockPath), false);
  });

  it('gives the Keychain write a timeoutMs no larger than the lock budget left after the refresh (findings S1, C5)', async () => {
    const monotonic = installMonotonicClock();
    const refreshTookMs = 12_000;
    harness.clients.youtube.onRefresh = async () => {
      monotonic.nowMs += refreshTookMs;
      await alignLockAge();
    };

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(acquisition.status, 'ready');
    assert.equal(vaultWritesSinceSeed(), 1);
    const writeTimeoutMs = harness.vault.writeTimeouts.at(-1);
    assert.ok(writeTimeoutMs !== undefined, 'the write was given a timeout');
    assert.ok(writeTimeoutMs > 0);
    assert.ok(writeTimeoutMs <= tokenLockBounds.operationBudgetMs - refreshTookMs, `timeoutMs ${writeTimeoutMs} fits the budget left`);
  });

  it('blocks a connection that health.json marks needs-reconnect in a fresh session, with no platform call or Keychain read (finding C10)', async () => {
    // Left by an earlier watcher process whose refresh was refused; this session has no memory of it.
    await writeHealthFile(harness.platformRoot, {
      format: 1,
      platform: 'youtube',
      connectionId,
      token: 'needs-reconnect',
      reconnectReason: 'token-revoked',
      checkedAt: harness.clock.now().toISOString(),
      backoff: null,
      lastPollAt: null,
    });

    const first = await harness.tokens.acquire('youtube', connectionId);
    const afterRejection = await harness.tokens.refreshAfterRejection('youtube', connectionId);

    assert.deepEqual(first, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.deepEqual(afterRejection, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(harness.vault.operationCounts().reads, baseline.reads);
  });

  it('is not blocked by a needs-reconnect that health.json recorded for an older connection (finding C10)', async () => {
    await writeHealthFile(harness.platformRoot, {
      format: 1,
      platform: 'youtube',
      connectionId: newUlid(harness.clock.now().getTime() - 2 * DAY_MS),
      token: 'needs-reconnect',
      reconnectReason: 'token-revoked',
      checkedAt: harness.clock.now().toISOString(),
      backoff: null,
      lastPollAt: null,
    });
    harness.clients.youtube.onRefresh = alignLockAge;

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(acquisition.status, 'ready');
    assert.equal(harness.clients.youtube.calls.refresh, 1);
  });

  /** A Keychain item for `bundleConnectionId`, inside the refresh margin like the seed. */
  function bundleFor(bundleConnectionId: string): TokenBundle {
    const now = harness.clock.now();
    return {
      format: 1,
      platform: 'youtube',
      connectionId: bundleConnectionId,
      accessToken: new SecretToken(SEED_ACCESS),
      accessExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      refreshToken: new SecretToken('reconnected-refresh-value-for-tests'),
      refreshExpiresAt: null,
      scopes: [],
      obtainedAt: now.toISOString(),
    };
  }

  it('blocks one call as health-unknown on an unreadable health.json, logs it once without its content, moves it to health.json.corrupt as 0600, then proceeds (finding R7)', async () => {
    const healthPath = accountFilePath(harness.platformRoot, 'youtube', 'health');
    const corruptContent = '{"token":"needs-reconnect","note":"corrupt-health-sentinel"';
    await writeFile(healthPath, corruptContent, { mode: 0o644 });

    const blockedCall = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(blockedCall, { status: 'blocked', reasonId: 'health-unknown' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(harness.vault.operationCounts().reads, baseline.reads, 'the Keychain is not read for a blocked call');
    assert.equal(await exists(healthPath), false, 'no health file is left for the next call');
    const asidePath = corruptHealthFilePath(harness.platformRoot, 'youtube');
    assert.equal(await readFile(asidePath, 'utf8'), corruptContent, 'the unreadable file is kept aside unchanged');
    assert.equal((await stat(asidePath)).mode & 0o777, 0o600);
    assert.deepEqual(harness.events.ofType('platform.health-unreadable'), [
      { type: 'platform.health-unreadable', platform: 'youtube', error: 'PlatformFileCorruptError' },
    ]);
    assert.deepEqual(harness.events.ofType('platform.health-set-aside-failed'), []);
    assert.equal(harness.logs.lines.join('\n').includes('corrupt-health-sentinel'), false, 'the file content reaches no log line');
    harness.clients.youtube.onRefresh = alignLockAge;

    const nextCall = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(nextCall.status, 'ready');
    assert.equal(harness.clients.youtube.calls.refresh, 1);
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1, 'logged once for the outage');
  });

  it('replaces an older health.json.corrupt with the newly unreadable file (finding R7)', async () => {
    const asidePath = corruptHealthFilePath(harness.platformRoot, 'youtube');
    await writeFile(asidePath, 'older-corrupt-file');
    await writeFile(accountFilePath(harness.platformRoot, 'youtube', 'health'), '{"token":');

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'health-unknown' });
    assert.equal(await readFile(asidePath, 'utf8'), '{"token":');
  });

  it('stays blocked and logs the outage once when the unreadable health.json cannot be moved aside (finding R7)', async () => {
    // A folder in the way of the rename: the move fails on every call.
    const asidePath = corruptHealthFilePath(harness.platformRoot, 'youtube');
    await mkdir(asidePath);
    await writeFile(join(asidePath, 'occupied'), '');
    await writeFile(accountFilePath(harness.platformRoot, 'youtube', 'health'), '{"token":');

    const first = await harness.tokens.acquire('youtube', connectionId);
    const second = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(first, { status: 'blocked', reasonId: 'health-unknown' });
    assert.deepEqual(second, { status: 'blocked', reasonId: 'health-unknown' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1);
    assert.equal(harness.events.ofType('platform.health-set-aside-failed').length, 1);
  });

  it('puts needs-reconnect back on the call after the recovery when the token is still revoked (finding R7)', async () => {
    await writeFile(accountFilePath(harness.platformRoot, 'youtube', 'health'), '{"token":"needs-reconnect"');
    assert.deepEqual(await harness.tokens.acquire('youtube', connectionId), { status: 'blocked', reasonId: 'health-unknown' });
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'token-revoked'));

    const afterRecovery = await harness.tokens.acquire('youtube', connectionId);
    const following = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(afterRecovery, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.deepEqual(following, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.equal(harness.clients.youtube.calls.refresh, 1, 'one refused refresh, then no call');
    const health = await new HealthReader(harness.platformRoot).read('youtube');
    assert.equal(health?.token, 'needs-reconnect');
    assert.equal(health?.reconnectReason, 'token-revoked');
    assert.equal(health?.connectionId, connectionId);
  });

  it('recovers a reconnect made while health.json is unreadable: one blocked call, then the new connection is used (finding R7)', async () => {
    await writeFile(accountFilePath(harness.platformRoot, 'youtube', 'health'), '{"token":"needs-reconnect","connectionId":"old"');
    // The api's reconnect: a new connectionId in account.json and a new Keychain item.
    const reconnectedId = newUlid(harness.clock.now().getTime());
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: reconnectedId, at: harness.clock.now(), mode: 'live' });
    await harness.vault.write(bundleFor(reconnectedId));
    harness.clients.youtube.onRefresh = alignLockAge;

    const blockedCall = await harness.tokens.acquire('youtube', reconnectedId);
    const nextCall = await harness.tokens.acquire('youtube', reconnectedId);

    // The core reader parses the file before it filters by connectionId, so the new connection waits one call too.
    assert.deepEqual(blockedCall, { status: 'blocked', reasonId: 'health-unknown' });
    assert.equal(nextCall.status, 'ready');
    assert.equal(nextCall.status === 'ready' ? nextCall.bundle.connectionId : null, reconnectedId);
    assert.equal(harness.clients.youtube.calls.refresh, 1);
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1);
  });
});
