import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { accountFilePath } from '@studio/shared/platforms/files';
import { corruptHealthFilePath } from './health-file.set-aside';
import { queuePublishRequest } from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, publicationLines, stateOf, type PlatformHarness } from './platform-step.harness.test';

/*
 * Round 4 item B (SPEC 0007 section 5.5, finding R7): the publish re-check that meets an unreadable
 * `health.json` moves it aside in the same tick, as the token and metrics paths do. That attempt
 * still fails `internal-error`, since what the file held is unknown; the next attempt proceeds.
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

describe('PublishStep re-check with an unreadable health.json (round 4 item B)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('moves health.json aside in that tick, fails the attempt as internal-error, and lets the next attempt publish', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const healthPath = accountFilePath(harness.platformRoot, 'youtube', 'health');
    await writeFile(healthPath, '{"token":"needs-reconnect","note":"corrupt-health-sentinel"');
    const first = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });

    assert.equal(await harness.publish.claimNext(), true);

    const failed = await stateOf(harness, first.attemptId);
    assert.equal(failed?.state, 'failed');
    assert.equal(failed?.reasonId, 'internal-error');
    assert.equal(harness.clients.youtube.calls.upload, 0);
    assert.equal(await exists(healthPath), false, 'moved aside in the same tick');
    assert.equal(
      await readFile(corruptHealthFilePath(harness.platformRoot, 'youtube'), 'utf8'),
      '{"token":"needs-reconnect","note":"corrupt-health-sentinel"',
    );
    assert.deepEqual(harness.events.ofType('platform.health-unreadable'), [
      { type: 'platform.health-unreadable', platform: 'youtube', error: 'PlatformFileCorruptError' },
    ]);
    assert.equal(harness.logs.lines.join('\n').includes('corrupt-health-sentinel'), false, 'the file content reaches no log line');

    harness.clock.advance(1_000);
    const next = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });

    assert.equal(await harness.publish.claimNext(), true);

    assert.equal((await stateOf(harness, next.attemptId))?.state, 'published');
    assert.equal(harness.clients.youtube.calls.upload, 1);
    assert.deepEqual(
      (await publicationLines(harness, run.runId)).map((line) => line.event),
      ['upload-started', 'published'],
      'the failed attempt left no line; the next one wrote its own',
    );
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1);
  });
});
