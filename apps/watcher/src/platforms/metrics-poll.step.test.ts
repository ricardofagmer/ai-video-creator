import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { HealthReader, PlatformClientError, localDateOf, type MetricResult, type PlatformClientErrorReason } from '@studio/core/platforms';
import { pollRules, type HealthFile, type Platform, type PollBackoffReason, type PublicationOrigin } from '@studio/shared/platforms';
import { accountFilePath, listMetricBatchIds, readMetricBatch, readPollCursor, writePollCursor } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { corruptHealthFilePath } from './health-file.set-aside';
import { DAY_MS, HOUR_MS, connectAccount, localDayBefore, queuePublishRequest, setGates } from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, stateOf, type PlatformHarness, type PublicationRow } from './platform-step.harness.test';

/*
 * The metrics poll pass through the real step (SPEC 0007 sections 5.5 and 5.7, AC 43, AC 53,
 * AC 56): publications come from the `run_publications` double, answers from the client double,
 * and the batch, cursor and `health.json` are the real files of an `fs.mkdtemp` data home.
 */

async function connect(harness: PlatformHarness, platform: Platform, mode: 'mock' | 'live' = 'mock'): Promise<string> {
  const connectionId = newUlid(harness.clock.now().getTime() - DAY_MS);
  await connectAccount(harness.platformRoot, { platform, connectionId, at: harness.clock.now(), mode });
  return connectionId;
}

/** A `run_publications` row; `mock` by default, the only origin a mock-mode poll asks for (finding C11). */
function publication(harness: PlatformHarness, platform: Platform, daysAgo: number, origin: PublicationOrigin = 'mock'): PublicationRow {
  const row: PublicationRow = {
    id: newUlid(harness.clock.now().getTime() - harness.prisma.publications.length - 1),
    platform,
    platformVideoId: platform === 'tiktok' ? `7${String(harness.prisma.publications.length).padStart(18, '0')}` : `vid${String(harness.prisma.publications.length).padStart(8, '0')}`,
    publishedOn: localDayBefore(harness.clock.now(), daysAgo),
    recordedAt: harness.clock.now(),
    origin,
    platformMediaId: null,
  };
  harness.prisma.publications.push(row);
  return row;
}

async function healthOf(harness: PlatformHarness, platform: Platform): Promise<HealthFile | null> {
  return new HealthReader(harness.platformRoot).read(platform);
}

describe('MetricsPollStep pass (AC 53)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('polls at most 50 due publications in one call, never-polled first, and drops one batch file', async () => {
    await connect(harness, 'youtube');
    const polled = Array.from({ length: 6 }, () => publication(harness, 'youtube', 10));
    const fresh = Array.from({ length: 48 }, () => publication(harness, 'youtube', 4));
    const yesterday = localDayBefore(harness.clock.now(), 1);
    const entries = Object.fromEntries(polled.map((row) => [row.id, { lastPolledOn: yesterday, stopped: null, strikes: 0, platformMediaId: null }]));
    await writePollCursor(harness.platformRoot, { format: 1, updatedAt: harness.clock.now().toISOString(), entries });

    assert.equal(await harness.metricsPoll.run(), true);

    const client = harness.clients.youtube;
    assert.equal(client.calls.fetchMetrics, 1);
    const asked = client.metricsRequests[0]?.targets.map((target) => target.publicationId) ?? [];
    assert.equal(asked.length, 50);
    for (const row of fresh) assert.ok(asked.includes(row.id));
    const batchIds = await listMetricBatchIds(harness.platformRoot);
    assert.equal(batchIds.length, 1);
    const batch = (await readMetricBatch(harness.platformRoot, batchIds[0] ?? '')).value;
    assert.equal(batch.platform, 'youtube');
    assert.equal(batch.mode, 'mock');
    assert.equal(batch.asOfDate, localDateOf(harness.clock.now()));
    assert.deepEqual(batch.rows.map((row) => row.publicationId).sort(), [...asked].sort());
    const cursor = await readPollCursor(harness.platformRoot);
    assert.ok(cursor.status === 'present');
    const today = localDateOf(harness.clock.now());
    assert.equal(Object.values(cursor.value.entries).filter((entry) => entry.lastPolledOn === today).length, 50);
    assert.equal((await healthOf(harness, 'youtube'))?.lastPollAt, harness.clock.now().toISOString());
  });

  it('stops a publication after three strikes on three days and no longer asks for it', async () => {
    await connect(harness, 'youtube');
    const unknown = publication(harness, 'youtube', 2);
    harness.clients.youtube.metricsAnswer = (request) => request.targets.map((target): MetricResult => ({ publicationId: target.publicationId, status: 'not-found' }));

    for (let day = 0; day < 4; day += 1) {
      await harness.metricsPoll.run();
      harness.clock.advance(DAY_MS);
    }

    assert.equal(harness.clients.youtube.calls.fetchMetrics, 3);
    const cursor = await readPollCursor(harness.platformRoot);
    assert.ok(cursor.status === 'present');
    assert.equal(cursor.value.entries[unknown.id]?.stopped, 'not-found');
    assert.deepEqual(await listMetricBatchIds(harness.platformRoot), [], 'no row, no batch file');
  });

  it('runs no pass for a platform whose metrics gate is awaiting-review', async () => {
    await connect(harness, 'tiktok');
    publication(harness, 'tiktok', 2);

    assert.equal(await harness.metricsPoll.run(), false);

    assert.equal(harness.clients.tiktok.calls.fetchMetrics, 0);
    assert.equal(harness.clients.tiktok.calls.refresh, 0);
  });

  it('skips one pass on an unreadable health.json, moves it to health.json.corrupt, and polls on a later pass (finding R7)', async () => {
    await connect(harness, 'youtube');
    publication(harness, 'youtube', 2);
    await writeFile(accountFilePath(harness.platformRoot, 'youtube', 'health'), '{"token":');

    assert.equal(await harness.metricsPoll.run(), false);

    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 0);
    assert.equal(await readFile(corruptHealthFilePath(harness.platformRoot, 'youtube'), 'utf8'), '{"token":');
    assert.deepEqual(harness.events.ofType('platform.health-unreadable'), [
      { type: 'platform.health-unreadable', platform: 'youtube', error: 'PlatformFileCorruptError' },
    ]);
    assert.deepEqual(harness.events.ofType('metrics.poll-failed'), [], 'logged once, as health-unreadable');

    harness.clock.advance(pollRules.minPassIntervalMs);

    assert.equal(await harness.metricsPoll.run(), true);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);
  });
});

describe('MetricsPollStep backoff (AC 56)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
    await setGates(harness.platformRoot, { tiktok: { metrics: 'enabled', publish: 'awaiting-review' } }, harness.clock.now());
    await connect(harness, 'youtube');
    await connect(harness, 'tiktok');
    publication(harness, 'youtube', 3);
    publication(harness, 'tiktok', 3);
  });

  afterEach(async () => {
    await harness.close();
  });

  const faults: readonly { reason: PlatformClientErrorReason & PollBackoffReason; untilMs: (nowMs: number) => number; label: string }[] = [
    { reason: 'rate-limited', label: 'a 429', untilMs: (nowMs) => nowMs + HOUR_MS },
    { reason: 'platform-unavailable', label: 'a 5xx', untilMs: (nowMs) => nowMs + HOUR_MS },
    { reason: 'network', label: 'a network error', untilMs: (nowMs) => nowMs + HOUR_MS },
    // START is 15:00Z on 2026-11-20 (07:00 PST): the next midnight Pacific is 08:00Z the next day.
    { reason: 'quota-exhausted', label: 'a YouTube quota error', untilMs: () => Date.parse('2026-11-21T08:00:00.000Z') },
  ];

  for (const fault of faults) {
    it(`ends the YouTube pass on ${fault.label} with no second call, writes the backoff and still polls TikTok`, async () => {
      harness.clients.youtube.metricsFailure = new PlatformClientError('youtube', 'metrics', fault.reason);
      const nowMs = harness.clock.now().getTime();

      await harness.metricsPoll.run();

      assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);
      assert.equal(harness.clients.youtube.calls.refresh, 1, 'no refresh retry either');
      assert.deepEqual((await healthOf(harness, 'youtube'))?.backoff, { reasonId: fault.reason, level: 1, until: new Date(fault.untilMs(nowMs)).toISOString() });
      assert.equal(harness.clients.tiktok.calls.fetchMetrics, 1);
      assert.equal((await healthOf(harness, 'tiktok'))?.backoff, null);
      const batches = await Promise.all((await listMetricBatchIds(harness.platformRoot)).map((id) => readMetricBatch(harness.platformRoot, id)));
      assert.deepEqual(batches.map((batch) => batch.value.platform), ['tiktok']);
    });
  }

  it('lets a Retry-After longer than the step set the wait', async () => {
    harness.clients.youtube.metricsFailure = new PlatformClientError('youtube', 'metrics', 'rate-limited', { transport: false, retryAfterSeconds: 5 * 3600 });
    const nowMs = harness.clock.now().getTime();

    await harness.metricsPoll.run();

    assert.equal((await healthOf(harness, 'youtube'))?.backoff?.until, new Date(nowMs + 5 * HOUR_MS).toISOString());
  });

  it('makes no call before until, then raises the level on the next consecutive failure', async () => {
    harness.clients.youtube.metricsFailure = new PlatformClientError('youtube', 'metrics', 'platform-unavailable');
    await harness.metricsPoll.run();
    harness.clock.advance(HOUR_MS / 2);
    await harness.metricsPoll.run();
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1, 'inside the backoff no call is made');

    harness.clock.advance(HOUR_MS);
    const nowMs = harness.clock.now().getTime();
    await harness.metricsPoll.run();

    assert.equal(harness.clients.youtube.calls.fetchMetrics, 2);
    assert.deepEqual((await healthOf(harness, 'youtube'))?.backoff, { reasonId: 'platform-unavailable', level: 2, until: new Date(nowMs + 2 * HOUR_MS).toISOString() });
  });
});

describe('Revoked token (AC 43)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('writes needs-reconnect after one pass and makes no further call for the platform', async () => {
    await connect(harness, 'youtube');
    publication(harness, 'youtube', 2);
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'token-revoked'));

    await harness.metricsPoll.run();
    harness.clock.advance(DAY_MS);
    await harness.metricsPoll.run();

    const health = await healthOf(harness, 'youtube');
    assert.equal(health?.token, 'needs-reconnect');
    assert.equal(health?.reconnectReason, 'token-revoked');
    assert.equal(harness.clients.youtube.calls.refresh, 1);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 0);
  });

  it('refreshes exactly once after a 401 on the metrics call, and a refused refresh gives needs-reconnect', async () => {
    await connect(harness, 'youtube');
    publication(harness, 'youtube', 2);
    harness.clients.youtube.metricsFailure = new PlatformClientError('youtube', 'metrics', 'token-revoked');
    harness.clients.youtube.refreshFailures.push(undefined, new PlatformClientError('youtube', 'refresh', 'refresh-expired'));

    await harness.metricsPoll.run();

    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);
    assert.equal(harness.clients.youtube.calls.refresh, 2);
    assert.equal((await healthOf(harness, 'youtube'))?.reconnectReason, 'refresh-expired');
  });

  it('fails an open publish attempt with token-revoked once the platform needs a reconnect', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    publication(harness, 'youtube', 2);
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'token-revoked'));
    await harness.metricsPoll.run();
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, request.attemptId))?.reasonId, 'token-revoked');
    assert.equal(harness.clients.youtube.calls.upload, 0);
  });
});

describe('MetricsPollStep pass budget (finding C7)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    mock.timers.reset();
    await harness.close();
  });

  it('aborts the fetchMetrics signal once passBudgetMs runs out and ends the pass cleanly with a network backoff', async () => {
    await connect(harness, 'youtube');
    publication(harness, 'youtube', 2);
    let markStarted: () => void = () => undefined;
    const callStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    // A platform that never answers: the client gives up only when the signal aborts, as the port requires.
    harness.clients.youtube.onFetchMetrics = (request) =>
      new Promise<void>((_resolve, reject) => {
        markStarted();
        request.signal.addEventListener('abort', () => reject(new PlatformClientError('youtube', 'metrics', 'network')), { once: true });
      });
    mock.timers.enable({ apis: ['setTimeout'] });

    const pass = harness.metricsPoll.run();
    await callStarted;
    const signal = harness.clients.youtube.metricsRequests[0]?.signal;
    mock.timers.tick(pollRules.passBudgetMs - 1);
    assert.equal(signal?.aborted, false, 'not before the budget');
    mock.timers.tick(1);

    assert.equal(await pass, true);
    assert.equal(signal?.aborted, true);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);
    assert.equal((await healthOf(harness, 'youtube'))?.backoff?.reasonId, 'network');
    assert.deepEqual(harness.events.ofType('metrics.poll-pass').map((event) => 'reasonId' in event && event.reasonId), ['network']);
    assert.deepEqual(harness.events.ofType('metrics.poll-failed'), []);
    assert.deepEqual(await listMetricBatchIds(harness.platformRoot), []);
  });

  it('ends the pass at passBudgetMs even when the client ignores the abort signal (finding R5)', async () => {
    await connect(harness, 'youtube');
    const row = publication(harness, 'youtube', 2);
    let markStarted: () => void = () => undefined;
    const callStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    // A client that breaks the port: it never answers and never listens to its signal.
    harness.clients.youtube.onFetchMetrics = () =>
      new Promise<void>(() => {
        markStarted();
      });
    mock.timers.enable({ apis: ['setTimeout'] });

    const pass = harness.metricsPoll.run();
    await callStarted;
    mock.timers.tick(pollRules.passBudgetMs);

    assert.equal(await pass, true);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);
    assert.equal((await healthOf(harness, 'youtube'))?.backoff?.reasonId, 'network');
    assert.deepEqual(harness.events.ofType('metrics.poll-pass').map((event) => 'reasonId' in event && event.reasonId), ['network']);
    assert.deepEqual(await listMetricBatchIds(harness.platformRoot), []);
    const cursor = await readPollCursor(harness.platformRoot);
    const entries = cursor.status === 'present' ? cursor.value.entries : {};
    assert.equal(entries[row.id]?.lastPolledOn ?? null, null, 'nothing is marked polled by a pass that timed out');
  });
});

describe('MetricsPollStep mode and origin (finding C11)', () => {
  let harness: PlatformHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  it('in mock mode asks only for mock publications and never marks a manual or studio one polled', async () => {
    harness = await createPlatformHarness();
    const current = harness;
    await connect(current, 'youtube');
    const mockRow = publication(current, 'youtube', 2, 'mock');
    const manual = publication(current, 'youtube', 2, 'manual');
    const studio = publication(current, 'youtube', 2, 'studio');

    assert.equal(await current.metricsPoll.run(), true);

    assert.deepEqual(current.clients.youtube.metricsRequests[0]?.targets.map((target) => target.publicationId), [mockRow.id]);
    const cursor = await readPollCursor(current.platformRoot);
    assert.ok(cursor.status === 'present');
    assert.equal(cursor.value.entries[mockRow.id]?.lastPolledOn, localDateOf(current.clock.now()));
    assert.equal(cursor.value.entries[manual.id], undefined);
    assert.equal(cursor.value.entries[studio.id], undefined);
  });

  it('in live mode with no live client yet polls nothing, so no publication of any origin is marked polled', async () => {
    // Which origins a live pass asks for is planPass's rule, tested in metrics-poll.plan.test.ts. Until
    // tickets 07 to 09 deliver a live client, the status reader answers `not-configured` for live mode
    // (no live client factory), so the step must make no call and mark nothing polled.
    harness = await createPlatformHarness({ modes: { youtube: { mode: 'live' } } });
    const current = harness;
    await connect(current, 'youtube', 'live');
    const mockRow = publication(current, 'youtube', 2, 'mock');
    const manual = publication(current, 'youtube', 2, 'manual');
    const studio = publication(current, 'youtube', 2, 'studio');

    assert.equal(await current.metricsPoll.run(), false);

    assert.equal(current.clients.youtube.metricsRequests.length, 0);
    assert.equal(current.clients.youtube.calls.refresh, 0);
    const cursor = await readPollCursor(current.platformRoot);
    const entries = cursor.status === 'present' ? cursor.value.entries : {};
    for (const row of [mockRow, manual, studio]) assert.equal(entries[row.id], undefined);
  });
});
