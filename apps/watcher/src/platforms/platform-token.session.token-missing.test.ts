import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { HealthReader, SecretToken, type TokenBundle, type TokenVaultLookup } from '@studio/core/platforms';
import { type Platform } from '@studio/shared/platforms';
import { newUlid } from '@studio/shared/run-files';
import { DAY_MS, connectAccount } from './platform-fixtures.harness.test';
import { createPlatformHarness, type PlatformHarness } from './platform-step.harness.test';

/*
 * Round 4 item A (SPEC 0007 section 5.2, AC 43): a connected account in a mode that keeps its bundle
 * in the vault, with no Keychain item, writes `health.json` `needs-reconnect` / `token-missing` once
 * and blocks every further call until a reconnect changes `connectionId`. Mock mode keeps no item
 * (section 5.8) and never gets that write. The Keychain is `InMemoryPlatformTokenVault`; the test
 * plays the api where it writes `account.json` and the Keychain item.
 */

function bundleFor(platform: Platform, connectionId: string, now: Date): TokenBundle {
  return {
    format: 1,
    platform,
    connectionId,
    accessToken: new SecretToken('token-missing-test-access-value'),
    // Well outside the refresh margin, so a found item is used as it is.
    accessExpiresAt: new Date(now.getTime() + DAY_MS).toISOString(),
    refreshToken: new SecretToken('token-missing-test-refresh-value'),
    refreshExpiresAt: null,
    scopes: [],
    obtainedAt: now.toISOString(),
  };
}

describe('PlatformTokenSession with no Keychain item, live mode (round 4 item A)', () => {
  let harness: PlatformHarness;
  let connectionId: string;

  beforeEach(async () => {
    harness = await createPlatformHarness({ modes: { youtube: { mode: 'live' } } });
    connectionId = newUlid(harness.clock.now().getTime() - DAY_MS);
    // A connected live account and no item: a reconnect whose write failed (F-1) or an item deleted by hand.
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), mode: 'live' });
  });

  afterEach(async () => {
    mock.restoreAll();
    await harness.close();
  });

  it('writes needs-reconnect / token-missing once, blocks this call and every later one, and calls nothing', async () => {
    const first = await harness.tokens.acquire('youtube', connectionId);
    const second = await harness.tokens.acquire('youtube', connectionId);
    const afterRejection = await harness.tokens.refreshAfterRejection('youtube', connectionId);

    assert.deepEqual(first, { status: 'blocked', reasonId: 'needs-reconnect' }, 'the first call already reads as needs-reconnect');
    assert.deepEqual(second, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.deepEqual(afterRejection, { status: 'blocked', reasonId: 'needs-reconnect' });
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(harness.vault.operationCounts().reads, 1, 'the Keychain is read once; the block then comes from memory');
    const health = await new HealthReader(harness.platformRoot).read('youtube');
    assert.equal(health?.connectionId, connectionId);
    assert.equal(health?.token, 'needs-reconnect');
    assert.equal(health?.reconnectReason, 'token-missing');
    assert.deepEqual(harness.events.ofType('platform.needs-reconnect'), [
      { type: 'platform.needs-reconnect', platform: 'youtube', connectionId, reason: 'token-missing' },
    ]);
  });

  it('keeps the block in a fresh session through health.json, with no Keychain read', async () => {
    await harness.tokens.acquire('youtube', connectionId);
    const restarted = await createPlatformHarness({ root: harness.root, clock: harness.clock, modes: { youtube: { mode: 'live' } } });
    try {
      const acquisition = await restarted.tokens.acquire('youtube', connectionId);

      assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'needs-reconnect' });
      assert.equal(restarted.vault.operationCounts().reads, 0);
      assert.deepEqual(restarted.events.ofType('platform.needs-reconnect'), [], 'nothing is written again');
    } finally {
      await restarted.close();
    }
  });

  it('is cleared by a reconnect: the new connection is used and no health.json applies to it', async () => {
    await harness.tokens.acquire('youtube', connectionId);
    const reconnectedId = newUlid(harness.clock.now().getTime());
    await harness.vault.write(bundleFor('youtube', reconnectedId, harness.clock.now()));
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: reconnectedId, at: harness.clock.now(), mode: 'live' });

    const acquisition = await harness.tokens.acquire('youtube', reconnectedId);

    assert.equal(acquisition.status, 'ready');
    assert.equal(acquisition.status === 'ready' ? acquisition.bundle.connectionId : null, reconnectedId);
    assert.equal(await new HealthReader(harness.platformRoot).forConnection('youtube', reconnectedId), null, 'the status reads connected again');
    assert.equal(harness.clients.youtube.calls.refresh, 0);
  });

  it('writes nothing when a disconnect wrote account.json before it deleted the item', async () => {
    // The api's disconnect lands between the watcher's account read and its Keychain read.
    mock.method(harness.vault, 'read', async (): Promise<TokenVaultLookup> => {
      await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), state: 'disconnected', mode: 'live' });
      return { status: 'not-found' };
    });

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'disconnected' });
    assert.equal(await new HealthReader(harness.platformRoot).read('youtube'), null);
    assert.deepEqual(harness.events.ofType('platform.needs-reconnect'), []);
  });

  it('writes nothing for a mock account met by a live-mode process: a mock connection keeps no item', async () => {
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), mode: 'mock' });

    const acquisition = await harness.tokens.acquire('youtube', connectionId);

    assert.deepEqual(acquisition, { status: 'blocked', reasonId: 'token-missing' });
    assert.equal(await new HealthReader(harness.platformRoot).read('youtube'), null);
    assert.deepEqual(harness.events.ofType('platform.needs-reconnect'), []);
  });
});

describe('PlatformTokenSession in mock mode with no Keychain item (round 4 item A)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('reads no item, uses its in-memory bundle and never writes needs-reconnect', async () => {
    const connectionId = newUlid(harness.clock.now().getTime() - DAY_MS);
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), mode: 'mock' });

    const first = await harness.tokens.acquire('youtube', connectionId);
    const second = await harness.tokens.acquire('youtube', connectionId);

    assert.equal(first.status, 'ready');
    assert.equal(second.status, 'ready');
    assert.equal(harness.vault.operationCounts().reads, 0);
    assert.equal(await new HealthReader(harness.platformRoot).read('youtube'), null);
    assert.deepEqual(harness.events.ofType('platform.needs-reconnect'), []);
    assert.deepEqual(harness.events.ofType('platform.token-unavailable'), []);
  });
});
