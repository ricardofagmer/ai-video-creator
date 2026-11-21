import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { connectionRedirectUri } from '@studio/shared/api';
import { tokenLockBounds } from '@studio/shared/platforms';
import { accountFilePath, writeGatesFile } from '@studio/shared/platforms/files';
import { KEYCHAIN_READ_TIMEOUT_MS } from '../../secrets/keychain';
import { ObservingTokenVault } from '../observing-vault.harness.test';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platform-harness.harness.test';
import { PlatformRefusedError, TokenVaultUnavailableError } from '../platforms.errors';
import { SENTINEL_ACCESS_TOKEN, sentinelTokenBundle } from '../token-fixtures.harness.test';
import { API_PORT, SESSION_ID, connectMock, openAllGates } from '../publish-scenario.harness.test';
import { LIVE_YOUTUBE_MODES, RecordingClients, SENTINEL_CREDENTIAL_ENVIRONMENT } from '../recording-client.harness.test';
import { AccountStore } from '../stores/platform-file.stores';
import { CompleteConnectionCommand, StartConnectionCommand } from './platform.commands';

/*
 * Connect (SPEC 0007 section 5.2, AC 39, AC 40): the authorize URL carries the api's own redirect
 * URI, a fresh single-use `state` and only the scopes of enabled capabilities; a callback whose
 * `state` is unknown, reused, expired, bound to another session or absent, or that carries an
 * `error`, stores nothing: no account.json and no vault write.
 */

const START = new Date('2026-11-20T10:00:00.000Z');
const TEN_MINUTES_MS = 10 * 60_000;

let harness: PlatformHarness;
let graph: PlatformGraph;
let clients: RecordingClients;

function startCommand(): StartConnectionCommand {
  return new StartConnectionCommand({ platform: 'youtube', sessionId: SESSION_ID, apiPort: API_PORT, correlationId: null });
}

function callback(options: { code: string | null; state: string | null; error?: string | null; sessionId?: string }): CompleteConnectionCommand {
  return new CompleteConnectionCommand({
    platform: 'youtube',
    sessionId: options.sessionId ?? SESSION_ID,
    apiPort: API_PORT,
    code: options.code,
    state: options.state,
    error: options.error ?? null,
    connectedBy: 'owner',
    correlationId: null,
  });
}

/** The code and state the authorize URL hands back to the callback. */
async function startAndReadCallback(): Promise<{ code: string | null; state: string | null }> {
  const started = await graph.start.execute(startCommand());
  const url = new URL(started.authorizeUrl);
  return { code: url.searchParams.get('code'), state: url.searchParams.get('state') };
}

async function assertNothingStored(): Promise<void> {
  assert.equal(await new AccountStore(harness.platformRoot).read('youtube'), null, 'no account.json');
  assert.equal(graph.vault.operationCounts().writes, 0, 'no vault write');
}

function refusedWith(reason: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof PlatformRefusedError && error.reason === reason;
}

describe('StartConnection authorize URL (AC 39)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-connect-start', start: START });
    clients = new RecordingClients();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('asks for the api redirect URI, a 43-character state and the scopes of enabled capabilities only', async () => {
    await writeGatesFile(harness.platformRoot, {
      format: 1,
      gates: {
        youtube: { metrics: 'enabled', publish: 'awaiting-review' },
        instagram: { metrics: 'enabled', publish: 'awaiting-review' },
        tiktok: { metrics: 'enabled', publish: 'enabled' },
      },
      updatedAt: START.toISOString(),
      updatedBy: 'owner',
    });

    await graph.start.execute(startCommand());

    const [request] = clients.youtube.authorizeRequests;
    assert.ok(request);
    assert.equal(request.redirectUri, connectionRedirectUri({ apiPort: API_PORT, platform: 'youtube' }));
    assert.match(request.state, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(request.scopes, clients.youtube.scopesFor(['metrics']));
    assert.equal(request.scopes.includes('youtube.upload'), false, 'no publish scope while publish awaits review');
    assert.notEqual(request.credentials, null, 'live mode passes the client credentials');
    assert.notEqual(request.challenge, null, 'YouTube uses a PKCE challenge');
  });

  it('adds the publish scope once the publish gate is enabled, and issues a new state each time', async () => {
    await openAllGates(harness);

    await graph.start.execute(startCommand());
    await graph.start.execute(startCommand());

    const [first, second] = clients.youtube.authorizeRequests;
    assert.ok(first && second);
    assert.equal(first.scopes.includes('youtube.upload'), true);
    assert.notEqual(first.state, second.state);
  });

  it('refuses with platform-awaiting-review when no capability is enabled', async () => {
    // A missing gates.json reads as the defaults, where YouTube is enabled (OD2): close both gates.
    await writeGatesFile(harness.platformRoot, {
      format: 1,
      gates: {
        youtube: { metrics: 'awaiting-review', publish: 'awaiting-review' },
        instagram: { metrics: 'enabled', publish: 'awaiting-review' },
        tiktok: { metrics: 'enabled', publish: 'enabled' },
      },
      updatedAt: START.toISOString(),
      updatedBy: 'owner',
    });

    await assert.rejects(graph.start.execute(startCommand()), refusedWith('platform-awaiting-review'));
    assert.equal(clients.youtube.authorizeRequests.length, 0);
  });
});

describe('CompleteConnection refusals store nothing (AC 40)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-connect-refusals', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('refuses an unknown state', async () => {
    const { code } = await startAndReadCallback();
    await assert.rejects(graph.complete.execute(callback({ code, state: 'A'.repeat(43) })), refusedWith('oauth-state-invalid'));
    await assertNothingStored();
  });

  it('refuses a callback without a state', async () => {
    const { code } = await startAndReadCallback();
    await assert.rejects(graph.complete.execute(callback({ code, state: null })), refusedWith('oauth-state-invalid'));
    await assertNothingStored();
  });

  it('refuses a state older than 10 minutes', async () => {
    const issued = await startAndReadCallback();
    harness.clock.advance(TEN_MINUTES_MS + 1);
    await assert.rejects(graph.complete.execute(callback(issued)), refusedWith('oauth-state-invalid'));
    await assertNothingStored();
  });

  it('refuses a state bound to another session, which also spends it', async () => {
    const issued = await startAndReadCallback();
    await assert.rejects(graph.complete.execute(callback({ ...issued, sessionId: 'another-session' })), refusedWith('oauth-state-invalid'));
    await assert.rejects(graph.complete.execute(callback(issued)), refusedWith('oauth-state-invalid'));
    await assertNothingStored();
  });

  it('refuses an error parameter with oauth-denied, and the state cannot be replayed', async () => {
    const issued = await startAndReadCallback();
    await assert.rejects(graph.complete.execute(callback({ ...issued, error: 'access_denied' })), refusedWith('oauth-denied'));
    await assert.rejects(graph.complete.execute(callback(issued)), refusedWith('oauth-state-invalid'));
    await assertNothingStored();
  });

  it('refuses a code the platform does not accept with oauth-exchange-failed', async () => {
    const { state } = await startAndReadCallback();
    await assert.rejects(graph.complete.execute(callback({ code: 'some-other-code', state })), refusedWith('oauth-exchange-failed'));
    await assertNothingStored();
  });

  it('refuses a reused state and keeps the connection the first callback stored', async () => {
    const issued = await startAndReadCallback();
    const first = await graph.complete.execute(callback(issued));

    await assert.rejects(graph.complete.execute(callback(issued)), refusedWith('oauth-state-invalid'));

    const account = await new AccountStore(harness.platformRoot).read('youtube');
    assert.equal(account?.connectionId, first.connectionId);
  });

  it('writes account.json but never the vault for a mock connection', async () => {
    const connectionId = await connectMock(graph, 'youtube');

    const account = await new AccountStore(harness.platformRoot).read('youtube');
    assert.equal(account?.connectionId, connectionId);
    assert.equal(account?.mode, 'mock');
    assert.equal(account?.state, 'connected');
    assert.equal(graph.vault.operationCounts().writes, 0);
    assert.equal(graph.vault.has('youtube'), false);
  });
});

describe('CompleteConnection never leaves a live item behind a failed or mock connect (S1, C5)', () => {
  afterEach(async () => {
    await harness.close();
  });

  it('deletes an earlier live item when a mock connect replaces the account', async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-connect-mock-delete', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await graph.vault.write(sentinelTokenBundle('youtube'));

    await connectMock(graph, 'youtube');

    assert.equal(graph.vault.has('youtube'), false, 'no mock account sits over a live, upload-capable token');
    assert.equal(graph.vault.operationCounts().writes, 1, 'only the seeded write');
    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.mode, 'mock');
  });

  it('deletes the item it just wrote when account.json then fails to write', async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-connect-account-fails', start: START });
    clients = new RecordingClients();
    const vault = new ObservingTokenVault();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT, vault });
    await openAllGates(harness);
    const accountPath = accountFilePath(harness.platformRoot, 'youtube', 'account');
    // A folder where account.json belongs makes the rename of the account write fail.
    vault.afterWrite = async (): Promise<void> => {
      await mkdir(accountPath);
    };

    await assert.rejects(connectMock(graph, 'youtube'));

    assert.equal(vault.operationCounts().writes, 1);
    assert.equal(vault.operationCounts().deletes, 1);
    assert.equal(vault.has('youtube'), false);
    assert.equal((await stat(accountPath)).isDirectory(), true, 'no account.json was written');
  });

  /** A live-mode graph over an observing vault, with the gates open. */
  async function liveGraphWithObservingVault(prefix: string): Promise<ObservingTokenVault> {
    harness = await createPlatformHarness({ prefix, start: START });
    clients = new RecordingClients();
    const vault = new ObservingTokenVault();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT, vault });
    await openAllGates(harness);
    return vault;
  }

  /** A write that throws after the item landed, as `write-not-confirmed` after a slow read-back would. */
  function writeLandsThenFails(vault: ObservingTokenVault): TokenVaultUnavailableError {
    const writeError = new TokenVaultUnavailableError('youtube', 'write', 'write-not-confirmed');
    vault.afterWrite = async (): Promise<void> => {
      throw writeError;
    };
    return writeError;
  }

  it('deletes the item and throws the write error when the vault write fails after landing, with no live account before (F-1)', async () => {
    const vault = await liveGraphWithObservingVault('studio-core-connect-write-fails');
    const writeError = writeLandsThenFails(vault);

    await assert.rejects(connectMock(graph, 'youtube'), (error: unknown) => error === writeError);

    assert.equal(vault.operationCounts().writes, 1);
    assert.equal(vault.operationCounts().deletes, 1);
    assert.equal(vault.has('youtube'), false, 'no orphan token outlives the failed write');
    assert.equal(await new AccountStore(harness.platformRoot).read('youtube'), null);
  });

  it('reads the item back and deletes the new bundle when a write that landed fails over a connected live account (F-1 replace)', async () => {
    const vault = await liveGraphWithObservingVault('studio-core-connect-rewrite-lands');
    const first = await connectMock(graph, 'youtube');
    const writeError = writeLandsThenFails(vault);

    await assert.rejects(connectMock(graph, 'youtube'), (error: unknown) => error === writeError);

    assert.equal(vault.operationCounts().deletes, 1, 'the new bundle had already overwritten the working one, so it is deleted');
    assert.equal(vault.has('youtube'), false, 'no item: the watcher writes needs-reconnect / token-missing');
    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.connectionId, first, 'account.json still names the old connection');
    const [readBackTimeoutMs] = vault.readTimeouts;
    assert.ok(readBackTimeoutMs !== undefined && readBackTimeoutMs > 0, 'the read-back runs bounded by the lock budget');
    assert.ok(
      readBackTimeoutMs <= tokenLockBounds.operationBudgetMs - KEYCHAIN_READ_TIMEOUT_MS / 2,
      `the read-back leaves the delete its share, got ${readBackTimeoutMs} ms`,
    );
  });

  it('keeps the working bundle when a write that never landed fails over a connected live account (F-1 replace)', async () => {
    const vault = await liveGraphWithObservingVault('studio-core-connect-rewrite-fails');
    const first = await connectMock(graph, 'youtube');
    const writeError = new TokenVaultUnavailableError('youtube', 'write', 'command-failed');
    vault.beforeWrite = async (): Promise<void> => {
      throw writeError;
    };

    await assert.rejects(connectMock(graph, 'youtube'), (error: unknown) => error === writeError);

    assert.equal(vault.operationCounts().deletes, 0, 'the working connection keeps its item');
    const remaining = await vault.read('youtube');
    assert.equal(remaining.status, 'found');
    assert.equal(remaining.status === 'found' ? remaining.bundle.connectionId : null, first, 'the item is still the old connection\'s bundle');
    assert.equal((await new AccountStore(harness.platformRoot).read('youtube'))?.connectionId, first);
  });

  it('throws the write error, deletes nothing and logs the failed read-back by id only (F-1 replace)', async () => {
    const vault = await liveGraphWithObservingVault('studio-core-connect-read-back-fails');
    await connectMock(graph, 'youtube');
    const writeError = writeLandsThenFails(vault);
    vault.beforeRead = async (): Promise<void> => {
      throw new Error(`read broke for ${SENTINEL_ACCESS_TOKEN}`);
    };

    await assert.rejects(connectMock(graph, 'youtube'), (error: unknown) => error === writeError);

    assert.equal(vault.operationCounts().deletes, 0, 'nothing is deleted on a guess');
    const readBackLines = harness.logs.lines.filter((line) => line.includes('platform.token-item-read-back-failed'));
    assert.equal(readBackLines.length, 1);
    for (const line of readBackLines) {
      assert.equal(line.includes(SENTINEL_ACCESS_TOKEN), false, 'no error text in the log');
      assert.match(line, /unexpected/, 'the failure id is logged');
    }
  });

  it('throws the write error, not the delete error, and logs the failed discard by id only (F-1)', async () => {
    const vault = await liveGraphWithObservingVault('studio-core-connect-discard-fails');
    const writeError = writeLandsThenFails(vault);
    vault.beforeDelete = async (): Promise<void> => {
      throw new Error(`delete broke for ${SENTINEL_ACCESS_TOKEN}`);
    };

    await assert.rejects(connectMock(graph, 'youtube'), (error: unknown) => error === writeError);

    const discardLines = harness.logs.lines.filter((line) => line.includes('platform.token-item-discard-failed'));
    assert.equal(discardLines.length, 1);
    for (const line of discardLines) assert.equal(line.includes(SENTINEL_ACCESS_TOKEN), false, 'no error text in the log');
  });

  it('gives the vault write a reserve so the discard delete still fits in the lock budget (F-1)', async () => {
    const vault = await liveGraphWithObservingVault('studio-core-connect-write-reserve');

    await connectMock(graph, 'youtube');

    const [writeTimeoutMs] = vault.writeTimeouts;
    assert.ok(writeTimeoutMs !== undefined && writeTimeoutMs > 0);
    assert.ok(writeTimeoutMs <= tokenLockBounds.operationBudgetMs - KEYCHAIN_READ_TIMEOUT_MS, `write got ${writeTimeoutMs} ms`);
  });

  it('writes no item when its token.lock is stale by the time of the write', async () => {
    // A clock ten minutes ahead of the lock file's mtime: the lock this process just took is
    // already past `tokenLockBounds.staleMs` when the write is about to happen.
    harness = await createPlatformHarness({ prefix: 'studio-core-connect-stale-lock', start: new Date(Date.now() + 10 * 60_000) });
    clients = new RecordingClients();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT });
    await openAllGates(harness);

    await assert.rejects(
      connectMock(graph, 'youtube'),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.failure === 'lock-held',
    );

    assert.equal(graph.vault.operationCounts().writes, 0);
    assert.equal(graph.vault.has('youtube'), false);
    assert.equal(await new AccountStore(harness.platformRoot).read('youtube'), null);
  });
});
