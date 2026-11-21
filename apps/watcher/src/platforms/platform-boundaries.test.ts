import assert from 'node:assert/strict';
import { readdir, readFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import { PlatformClientError, SecretToken } from '@studio/core/platforms';
import { accountFilePath, gatesFilePath, publishFilePath } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import {
  DAY_MS,
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_ACCOUNT_LABEL,
  SENTINEL_CAPTION,
  SENTINEL_REFRESH_TOKEN,
  SENTINEL_TAG,
  SENTINEL_TITLE,
  connectAccount,
  localDayBefore,
  queuePublishRequest,
  setGates,
} from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, stateOf, type PlatformHarness } from './platform-step.harness.test';

/*
 * Boundaries of the watcher's platform steps after a whole publish and poll (SPEC 0007 K1 to K3,
 * K7): AC 57 at run time (no SQLite write reaches the double; `gates.json`, `account.json` and
 * `request.json` are byte-identical afterwards and no `cancel` appears) and the sentinel search of
 * AC 41 and AC 60 (no token value in any file of the data home, any log line or any event, even
 * when a client error quotes one; no title, caption, tag or account label in logs or events).
 */

const TOKENS = [SENTINEL_ACCESS_TOKEN, SENTINEL_REFRESH_TOKEN];
const OWNER_TEXT = [SENTINEL_TITLE, SENTINEL_CAPTION, SENTINEL_TAG, SENTINEL_ACCOUNT_LABEL];

async function allFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) found.push(...(await allFiles(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

async function filesContaining(root: string, needles: readonly string[]): Promise<string[]> {
  const hits: string[] = [];
  for (const file of await allFiles(root)) {
    const text = await readFile(file, 'utf8');
    if (needles.some((needle) => text.includes(needle))) hits.push(file);
  }
  return hits;
}

function logAndEventText(harness: PlatformHarness): string {
  return [...harness.logs.lines, inspect(harness.events.events, { depth: 8 })].join('\n');
}

/** A YouTube account with a request and a due `mock` publication (the origin a mock-mode poll asks for), ready for one publish and one poll. */
async function publishAndPoll(harness: PlatformHarness): Promise<{ attemptId: string; connectionId: string }> {
  const { connectionId, run } = await prepareRun(harness, 'youtube');
  const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
  harness.prisma.publications.push({
    id: newUlid(harness.clock.now().getTime() - DAY_MS),
    platform: 'youtube',
    platformVideoId: 'abcdefghijk',
    publishedOn: localDayBefore(harness.clock.now(), 3),
    recordedAt: harness.clock.now(),
    origin: 'mock',
    platformMediaId: null,
  });
  await harness.publish.sweep();
  await harness.publish.claimNext();
  await harness.metricsPoll.run();
  return { attemptId: request.attemptId, connectionId };
}

describe('Platform step boundaries', () => {
  let harness: PlatformHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  it('writes no SQLite row and never writes gates.json, account.json, request.json or cancel (AC 57)', async () => {
    harness = await createPlatformHarness();
    const current = harness;
    await setGates(current.platformRoot, { tiktok: { metrics: 'enabled', publish: 'enabled' } }, current.clock.now());
    const { connectionId, run } = await prepareRun(current, 'youtube');
    const request = await queuePublishRequest(current.platformRoot, { run, platform: 'youtube', connectionId, at: current.clock.now() });
    const ownedByApi = [
      gatesFilePath(current.platformRoot),
      accountFilePath(current.platformRoot, 'youtube', 'account'),
      publishFilePath(current.platformRoot, request.attemptId, 'request'),
    ];
    const before = await Promise.all(ownedByApi.map((file) => readFile(file, 'utf8')));
    current.prisma.publications.push({
      id: newUlid(current.clock.now().getTime() - DAY_MS),
      platform: 'youtube',
      platformVideoId: 'abcdefghijk',
      publishedOn: localDayBefore(current.clock.now(), 3),
      recordedAt: current.clock.now(),
      origin: 'mock',
      platformMediaId: null,
    });

    await current.publish.sweep();
    await current.publish.claimNext();
    await current.metricsPoll.run();

    assert.equal((await stateOf(current, request.attemptId))?.state, 'published', 'the publish really ran');
    assert.equal(current.clients.youtube.calls.fetchMetrics, 1, 'the poll really ran');
    assert.deepEqual(current.prisma.writeAttempts, []);
    assert.deepEqual(await Promise.all(ownedByApi.map((file) => readFile(file, 'utf8'))), before);
    const files = await allFiles(current.platformRoot);
    assert.equal(files.some((file) => file.endsWith(`${request.attemptId}/cancel`)), false);
  });

  it('keeps sentinel tokens out of every file, log line and event after a publish and a poll (AC 41, AC 60)', async () => {
    harness = await createPlatformHarness();
    const current = harness;

    await publishAndPoll(current);

    const uploadTokens = current.clients.youtube.uploadRequests[0]?.tokens;
    assert.equal(uploadTokens?.accessToken.revealForPlatformCall(), SENTINEL_ACCESS_TOKEN, 'the sentinel was really in use');
    assert.equal(current.clients.youtube.metricsRequests[0]?.tokens.refreshToken?.revealForPlatformCall(), SENTINEL_REFRESH_TOKEN);
    assert.deepEqual(await filesContaining(current.root, TOKENS), []);
    const text = logAndEventText(current);
    for (const needle of [...TOKENS, ...OWNER_TEXT]) assert.equal(text.includes(needle), false, `logs and events never carry ${needle}`);
  });

  it('keeps a token quoted by a failing client out of files, logs and events (AC 60)', async () => {
    harness = await createPlatformHarness();
    const current = harness;
    current.clients.youtube.uploadFailure = new Error(`upload refused for bearer ${SENTINEL_ACCESS_TOKEN}`);
    current.clients.youtube.metricsFailure = new Error(`metrics refused for refresh ${SENTINEL_REFRESH_TOKEN}`);

    const { attemptId } = await publishAndPoll(current);

    assert.equal((await stateOf(current, attemptId))?.reasonId, 'internal-error');
    assert.equal(current.clients.youtube.calls.fetchMetrics, 1);
    assert.deepEqual(await filesContaining(current.root, TOKENS), []);
    const text = logAndEventText(current);
    for (const needle of [...TOKENS, ...OWNER_TEXT]) assert.equal(text.includes(needle), false, `logs and events never carry ${needle}`);
  });

  it('writes a refreshed live token only to the Keychain, and a refused refresh logs no token (AC 41)', async () => {
    harness = await createPlatformHarness({ modes: { youtube: { mode: 'live' } } });
    const current = harness;
    const now = current.clock.now();
    const connectionId = newUlid(now.getTime() - DAY_MS);
    await connectAccount(current.platformRoot, { platform: 'youtube', connectionId, at: now, mode: 'live' });
    // `token.lock`'s age is judged against the injected clock: the lock held during each refresh gets its mtime.
    const lockPath = accountFilePath(current.platformRoot, 'youtube', 'tokenLock');
    current.clients.youtube.onRefresh = async () => utimes(lockPath, current.clock.now(), current.clock.now());
    await current.vault.write({
      format: 1,
      platform: 'youtube',
      connectionId,
      accessToken: new SecretToken('seed-access-value-for-tests'),
      accessExpiresAt: now.toISOString(),
      refreshToken: new SecretToken('seed-refresh-value-for-tests'),
      refreshExpiresAt: null,
      scopes: [],
      obtainedAt: now.toISOString(),
    });

    assert.equal((await current.tokens.acquire('youtube', connectionId)).status, 'ready');
    current.clock.advance(2 * 3_600_000);
    current.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'token-revoked'));
    assert.equal((await current.tokens.acquire('youtube', connectionId)).status, 'blocked');

    const lookup = await current.vault.read('youtube');
    assert.ok(lookup.status === 'found');
    assert.equal(lookup.bundle.accessToken.revealForPlatformCall(), SENTINEL_ACCESS_TOKEN);
    assert.deepEqual(await filesContaining(current.root, TOKENS), []);
    const text = logAndEventText(current);
    for (const needle of TOKENS) assert.equal(text.includes(needle), false);
  });
});
