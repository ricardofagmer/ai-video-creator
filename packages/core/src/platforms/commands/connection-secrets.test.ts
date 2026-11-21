import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, readAllFiles, type PlatformHarness } from '../platform-harness.harness.test';
import { API_PORT, SESSION_ID, connectMock, openAllGates } from '../publish-scenario.harness.test';
import { LIVE_YOUTUBE_MODES, RecordingClients, SENTINEL_CREDENTIAL_ENVIRONMENT } from '../recording-client.harness.test';
import { AccountStore } from '../stores/platform-file.stores';
import { SENTINEL_ACCESS_TOKEN, SENTINEL_REFRESH_TOKEN, sentinelsIn } from '../token-fixtures.harness.test';
import { CompleteConnectionCommand, DisconnectCommand, StartConnectionCommand } from './platform.commands';

/*
 * Token confinement (SPEC 0007 K3, K7, AC 41, AC 60): a connect whose platform answers with the
 * sentinel tokens keeps them in the vault only. No file under the data home (account.json, the
 * SQLite database and its journal included), no log line, no result and no error message holds a
 * sentinel token, the sentinel code or the sentinel client credentials.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;
let graph: PlatformGraph;
let clients: RecordingClients;

async function assertNoSentinelOutsideTheVault(): Promise<void> {
  for (const file of await readAllFiles(harness.root)) assert.deepEqual(sentinelsIn(file.text), [], file.path);
  assert.deepEqual(sentinelsIn(harness.logs.text()), [], 'logs');
}

describe('connect with a live-mode client keeps every token in the vault only', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-connect-secrets', start: START });
    clients = new RecordingClients();
    graph = buildPlatformGraph(harness, { modes: LIVE_YOUTUBE_MODES, clients, environment: SENTINEL_CREDENTIAL_ENVIRONMENT });
    await openAllGates(harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('writes the token bundle to the vault once, under the new connection id', async () => {
    const connectionId = await connectMock(graph, 'youtube');

    assert.equal(graph.vault.operationCounts().writes, 1);
    const stored = await graph.vault.read('youtube');
    assert.equal(stored.status, 'found');
    if (stored.status !== 'found') return;
    assert.equal(stored.bundle.connectionId, connectionId);
    assert.equal(stored.bundle.accessToken.revealForPlatformCall(), SENTINEL_ACCESS_TOKEN);
    assert.equal(stored.bundle.refreshToken?.revealForPlatformCall(), SENTINEL_REFRESH_TOKEN);
    const account = await new AccountStore(harness.platformRoot).read('youtube');
    assert.equal(account?.mode, 'live');
    assert.equal(account?.connectionId, connectionId);
  });

  it('leaves no sentinel in any file, database page, log line or result after a connect', async () => {
    const started = await graph.start.execute(
      new StartConnectionCommand({ platform: 'youtube', sessionId: SESSION_ID, apiPort: API_PORT, correlationId: null }),
    );
    const url = new URL(started.authorizeUrl);
    const completed = await graph.complete.execute(
      new CompleteConnectionCommand({
        platform: 'youtube',
        sessionId: SESSION_ID,
        apiPort: API_PORT,
        code: url.searchParams.get('code'),
        state: url.searchParams.get('state'),
        error: null,
        connectedBy: 'owner',
        correlationId: null,
      }),
    );

    assert.deepEqual(sentinelsIn(inspect(completed, { depth: 8 })), []);
    await assertNoSentinelOutsideTheVault();
  });

  it('keeps sentinels out of the refusal raised by a replayed callback', async () => {
    const started = await graph.start.execute(
      new StartConnectionCommand({ platform: 'youtube', sessionId: SESSION_ID, apiPort: API_PORT, correlationId: null }),
    );
    const url = new URL(started.authorizeUrl);
    const replay = new CompleteConnectionCommand({
      platform: 'youtube',
      sessionId: SESSION_ID,
      apiPort: API_PORT,
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      error: null,
      connectedBy: 'owner',
      correlationId: null,
    });
    await graph.complete.execute(replay);

    await assert.rejects(graph.complete.execute(replay), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.deepEqual(sentinelsIn(`${error.message}\n${inspect(error, { depth: 8 })}`), []);
      return true;
    });
    await assertNoSentinelOutsideTheVault();
  });

  it('revokes, deletes the vault item and marks the account disconnected, still leaving no sentinel behind', async () => {
    const connectionId = await connectMock(graph, 'youtube');

    const view = await graph.disconnect.execute(new DisconnectCommand({ platform: 'youtube', correlationId: null }));

    assert.equal(clients.youtube.revokeCalls.length, 1);
    const [revoked] = clients.youtube.revokeCalls;
    assert.ok(revoked);
    assert.equal(revoked.tokens.connectionId, connectionId, 'revoke receives the stored bundle');
    assert.equal(revoked.tokens.accessToken.revealForPlatformCall(), SENTINEL_ACCESS_TOKEN);
    assert.notEqual(revoked.credentials, null, 'live revoke receives the client credentials');
    assert.equal(graph.vault.has('youtube'), false);
    const account = await new AccountStore(harness.platformRoot).read('youtube');
    assert.equal(account?.state, 'disconnected');
    assert.deepEqual(sentinelsIn(inspect(view, { depth: 8 })), []);
    await assertNoSentinelOutsideTheVault();
  });
});
