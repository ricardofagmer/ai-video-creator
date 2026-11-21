import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { stat, utimes, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type Platform } from '@studio/shared/platforms';
import { accountFilePath } from '@studio/shared/platforms/files';
import { PlatformClientError } from '../clients/platform-client.errors';
import { type PlatformClient, type PlatformClientCredentials } from '../clients/platform-client.port';
import { type PlatformClients } from '../clients/platform-client.registry';
import { ObservingTokenVault } from '../observing-vault.harness.test';
import { ALL_MOCK_MODES, buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platform-harness.harness.test';
import { TokenVaultUnavailableError } from '../platforms.errors';
import { connectMock, openAllGates } from '../publish-scenario.harness.test';
import { LIVE_YOUTUBE_MODES, RecordingClient, RecordingClients, SENTINEL_CREDENTIAL_ENVIRONMENT } from '../recording-client.harness.test';
import { AccountStore } from '../stores/platform-file.stores';
import { type TokenBundle } from '../token-bundle';
import { sentinelTokenBundle } from '../token-fixtures.harness.test';
import { DisconnectCommand } from './platform.commands';

/*
 * Disconnect under `token.lock` (SPEC 0007 section 5.2, AC 42, findings S1 and C5): a lock another
 * live process holds refuses with keychain-unavailable / lock-held and changes nothing; a lock
 * left by a process that exited is taken over and the disconnect completes. The Keychain item is
 * deleted whatever the account's mode, with or without a connected account, after `account.json`
 * says `disconnected`, and a failed revoke does not stop the delete. The parent of the test
 * process stands in for another live process; a child that already exited stands in for a crashed
 * one.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;
let graph: PlatformGraph;
let clients: RecordingClients;

function exitedPid(): number {
  const child = spawnSync(process.execPath, ['-e', '0']);
  assert.ok(child.pid !== undefined && child.pid > 0);
  return child.pid;
}

/** A lock file owned by `pid`, dated at the harness clock so its age never makes it stale. */
async function placeLock(pid: number): Promise<string> {
  const lockPath = accountFilePath(harness.platformRoot, 'youtube', 'tokenLock');
  await writeFile(lockPath, `${pid}\n`, { mode: 0o600 });
  await utimes(lockPath, harness.clock.now(), harness.clock.now());
  return lockPath;
}

function disconnectCommand(): DisconnectCommand {
  return new DisconnectCommand({ platform: 'youtube', correlationId: null });
}

/** A delivered live client whose revoke the platform refuses. */
class FailingRevokeClient extends RecordingClient {
  override async revoke(tokens: TokenBundle, credentials: PlatformClientCredentials | null): Promise<void> {
    await super.revoke(tokens, credentials);
    throw new PlatformClientError(this.platform, 'revoke', 'platform-unavailable');
  }
}

describe('Disconnect and token.lock (AC 42)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-disconnect', start: START });
    clients = new RecordingClients();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT });
    await openAllGates(harness);
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('refuses with lock-held while another live process holds token.lock, deleting nothing', async () => {
    const lockPath = await placeLock(process.ppid);

    await assert.rejects(
      graph.disconnect.execute(disconnectCommand()),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.failure === 'lock-held' && error.reason === 'keychain-unavailable',
    );

    assert.equal(graph.vault.has('youtube'), true);
    assert.equal(graph.vault.operationCounts().deletes, 0);
    assert.equal(clients.youtube.revokeCalls.length, 0);
    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.state, 'connected');
    assert.ok((await stat(lockPath)).isFile(), 'the other owner keeps its lock');
  });

  it('takes over a lock left by a process that exited and completes the disconnect', async () => {
    const lockPath = await placeLock(exitedPid());

    await graph.disconnect.execute(disconnectCommand());

    assert.equal(graph.vault.has('youtube'), false);
    assert.equal(clients.youtube.revokeCalls.length, 1);
    assert.notEqual(clients.youtube.revokeCalls[0]?.credentials ?? null, null, 'live revoke receives the client credentials');
    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.state, 'disconnected');
    await assert.rejects(stat(lockPath), { code: 'ENOENT' }, 'the lock is released afterwards');
  });

  it('repeats only the item delete when the platform is already disconnected: no account write, no write, no revoke', async () => {
    await graph.disconnect.execute(disconnectCommand());
    const accountBefore = await new AccountStore(harness.platformRoot).read('youtube');
    const before = graph.vault.operationCounts();
    harness.clock.advance(60_000);

    await graph.disconnect.execute(disconnectCommand());

    const after = graph.vault.operationCounts();
    assert.equal(after.writes, before.writes);
    assert.equal(after.deletes, before.deletes + 1, 'an interrupted earlier disconnect is finished by this one');
    assert.equal(clients.youtube.revokeCalls.length, 1);
    assert.deepEqual(await new AccountStore(harness.platformRoot).read('youtube'), accountBefore, 'account.json is not rewritten');
  });
});

describe('Disconnect always deletes the Keychain item (S1, C5)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-disconnect-delete', start: START });
    await openAllGates(harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('deletes an older live item under a mock account, without any platform call', async () => {
    clients = new RecordingClients();
    graph = buildPlatformGraph(harness, { modes: ALL_MOCK_MODES, clients });
    await connectMock(graph, 'youtube');
    // A live item left from before the account was switched to mock mode.
    await graph.vault.write(sentinelTokenBundle('youtube'));

    await graph.disconnect.execute(disconnectCommand());

    assert.equal(graph.vault.has('youtube'), false);
    assert.equal(clients.youtube.revokeCalls.length, 0, 'mock mode makes no revoke call');
    const account = await new AccountStore(harness.platformRoot).read('youtube');
    assert.equal(account?.mode, 'mock');
    assert.equal(account?.state, 'disconnected');
  });

  it('deletes the item when no account is connected, writing no account.json', async () => {
    graph = buildPlatformGraph(harness);
    await graph.vault.write(sentinelTokenBundle('youtube'));

    await graph.disconnect.execute(disconnectCommand());

    assert.equal(graph.vault.has('youtube'), false);
    assert.equal(await new AccountStore(harness.platformRoot).read('youtube'), null);
    assert.match(harness.logs.text(), /platform\.token-item-deleted/);
  });

  it('writes account.json disconnected, and revokes, before it deletes the item', async () => {
    clients = new RecordingClients();
    const vault = new ObservingTokenVault();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT, vault });
    await connectMock(graph, 'youtube');
    const seenAtDelete: { state: string | null; revokes: number }[] = [];
    vault.beforeDelete = async (): Promise<void> => {
      const account = await new AccountStore(harness.platformRoot).read('youtube');
      seenAtDelete.push({ state: account?.state ?? null, revokes: clients.youtube.revokeCalls.length });
    };

    await graph.disconnect.execute(disconnectCommand());

    assert.deepEqual(seenAtDelete, [{ state: 'disconnected', revokes: 1 }]);
    assert.equal(vault.has('youtube'), false);
  });

  it('still deletes the item and marks the account disconnected when the revoke fails', async () => {
    const failing = new FailingRevokeClient('youtube');
    const others = new RecordingClients();
    const failingClients: PlatformClients = {
      clientFor: (platform: Platform): PlatformClient => (platform === 'youtube' ? failing : others.clientFor(platform)),
    };
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients: failingClients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT });
    await connectMock(graph, 'youtube');
    assert.equal(graph.vault.has('youtube'), true);

    await graph.disconnect.execute(disconnectCommand());

    assert.equal(failing.revokeCalls.length, 1, 'the revoke was attempted');
    assert.equal(graph.vault.has('youtube'), false);
    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.state, 'disconnected');
    assert.match(harness.logs.text(), /platform\.revoke-failed/);
    assert.match(harness.logs.text(), /platform-unavailable/);
  });

  it('marks the account disconnected but reports keychain-unavailable when the delete itself fails', async () => {
    clients = new RecordingClients();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT });
    await connectMock(graph, 'youtube');
    graph.vault.failAll(true);

    await assert.rejects(
      graph.disconnect.execute(disconnectCommand()),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.operation === 'delete',
    );

    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.state, 'disconnected');
    graph.vault.failAll(false);
    assert.equal(graph.vault.has('youtube'), true, 'the item is left for the next disconnect');
  });
});
