import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { pollRules } from '@studio/shared/platforms';
import { accountFilePath } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { corruptHealthFilePath } from './health-file.set-aside';
import { DAY_MS, connectAccount, localDayBefore, setGates } from './platform-fixtures.harness.test';
import { createPlatformHarness, type PlatformHarness } from './platform-step.harness.test';

/*
 * Round 4 item B (SPEC 0007 section 5.7, finding R7): inside the hourly spacing between passes the
 * metrics step reads no snapshot, yet an unreadable `health.json` is still moved aside in that tick
 * rather than at the next pass.
 */

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('MetricsPollStep inside the pass spacing with an unreadable health.json (round 4 item B)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('moves health.json aside while throttled, makes no call, and polls again once the spacing allows', async () => {
    const connectionId = newUlid(harness.clock.now().getTime() - DAY_MS);
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId, at: harness.clock.now(), mode: 'mock' });
    harness.prisma.publications.push({
      id: newUlid(harness.clock.now().getTime() - 1),
      platform: 'youtube',
      platformVideoId: 'vid00000000',
      publishedOn: localDayBefore(harness.clock.now(), 2),
      recordedAt: harness.clock.now(),
      origin: 'mock',
      platformMediaId: null,
    });
    assert.equal(await harness.metricsPoll.run(), true, 'the first pass polls and starts the spacing');
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);

    const healthPath = accountFilePath(harness.platformRoot, 'youtube', 'health');
    await writeFile(healthPath, '{"token":');
    harness.clock.advance(pollRules.minPassIntervalMs / 2);

    assert.equal(await harness.metricsPoll.run(), false);

    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1, 'still inside the spacing: no call');
    assert.equal(await exists(healthPath), false, 'moved aside in this tick');
    assert.equal(await readFile(corruptHealthFilePath(harness.platformRoot, 'youtube'), 'utf8'), '{"token":');
    assert.deepEqual(harness.events.ofType('platform.health-unreadable'), [
      { type: 'platform.health-unreadable', platform: 'youtube', error: 'PlatformFileCorruptError' },
    ]);
    assert.deepEqual(harness.events.ofType('metrics.poll-failed'), []);

    harness.clock.advance(DAY_MS);

    assert.equal(await harness.metricsPoll.run(), true);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 2);
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1);
  });

  it('keeps a non-parse read error on a throttled health.json with that platform, lets another platform poll, and logs it once per outage (critic rounds 4 and 5)', async () => {
    const at = harness.clock.now();
    await setGates(harness.platformRoot, { tiktok: { metrics: 'enabled', publish: 'awaiting-review' } }, at);
    await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: newUlid(at.getTime() - DAY_MS), at, mode: 'mock' });
    harness.prisma.publications.push({
      id: newUlid(at.getTime() - 2),
      platform: 'youtube',
      platformVideoId: 'vid00000000',
      publishedOn: localDayBefore(at, 2),
      recordedAt: at,
      origin: 'mock',
      platformMediaId: null,
    });
    assert.equal(await harness.metricsPoll.run(), true, 'youtube polls and starts its spacing');
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1);

    // A directory in place of the file gives EISDIR, a read error that is not a parse error, for any user,
    // root included (a 0000-mode file stays readable for root).
    const healthPath = accountFilePath(harness.platformRoot, 'youtube', 'health');
    await rm(healthPath, { recursive: true, force: true });
    await mkdir(healthPath);
    // Connected only now, so the first pass did not start TikTok's own spacing.
    await connectAccount(harness.platformRoot, { platform: 'tiktok', connectionId: newUlid(at.getTime() - DAY_MS), at, mode: 'mock' });
    harness.prisma.publications.push({
      id: newUlid(at.getTime() - 1),
      platform: 'tiktok',
      platformVideoId: '7300000000000000000',
      publishedOn: localDayBefore(at, 2),
      recordedAt: at,
      origin: 'mock',
      platformMediaId: null,
    });
    harness.clock.advance(pollRules.minPassIntervalMs / 2);
    const failedPlatforms = (): unknown[] =>
      harness.events.ofType('metrics.poll-failed').map((event) => ('platform' in event ? event.platform : undefined));

    // Before the round 4 fix the error escaped `eligible`, ended the pass in `run()`'s catch with
    // `platform: null`, and TikTok, after YouTube in the platform order, was never looked at.
    assert.equal(await harness.metricsPoll.run(), true, 'tiktok polls in the same tick');
    assert.equal(harness.clients.tiktok.calls.fetchMetrics, 1);
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1, 'youtube stays inside its spacing');
    assert.equal(await exists(healthPath), true, 'a non-parse read error moves nothing aside');
    assert.deepEqual(failedPlatforms(), ['youtube'], 'the read error is logged against youtube, not against the whole pass');

    // The loop ticks every second; the same outage is not logged again.
    harness.clock.advance(1000);
    await harness.metricsPoll.run();
    harness.clock.advance(1000);
    await harness.metricsPoll.run();
    assert.deepEqual(failedPlatforms(), ['youtube'], 'logged once per outage');

    // A clean read ends the outage, so a new one is logged again.
    await rm(healthPath, { recursive: true });
    harness.clock.advance(1000);
    await harness.metricsPoll.run();
    await mkdir(healthPath);
    harness.clock.advance(1000);
    await harness.metricsPoll.run();
    assert.deepEqual(failedPlatforms(), ['youtube', 'youtube'], 'a new outage is logged once');
    assert.equal(harness.clients.youtube.calls.fetchMetrics, 1, 'still inside the spacing: no youtube call');
  });
});
