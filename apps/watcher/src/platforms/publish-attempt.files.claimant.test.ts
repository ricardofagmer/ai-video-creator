import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os, { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { DataHome } from '@studio/core/paths';
import { type PublishAttemptId } from '@studio/shared/platforms';
import { publishAttemptDirectory, publishFilePath, writePublishState } from '@studio/shared/platforms/files';
import { currentBootTimeMs, newUlid } from '@studio/shared/run-files';
import { queuePublishRequest } from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, stateOf, type PlatformHarness } from './platform-step.harness.test';
import { PublishAttemptFiles } from './publish-attempt.files';

/*
 * Liveness of a publish claim (SPEC 0007 section 5.5, finding C1): a claim holds `<pid> <bootTimeMs>`,
 * and its claimant is live only when it ran under this boot, its pid answers signal 0 as a process
 * of this user, and it is not this process's own pid. `process.kill` and `os.uptime` are replaced
 * before every test and a preflight proves both replacements are live, so no real pid is ever
 * signalled and the boot time is the fake one, whatever machine runs the suite.
 */

const SELF_PID = 51_001;
const OTHER_PID = 52_002;
const UPTIME_SECONDS = 86_400;
const WEEK_MS = 7 * 86_400_000;
const PREFLIGHT_NOW_MS = 1_800_000_000_000;

type KillAnswer = 'alive' | 'ESRCH' | 'EPERM';

/** The process table as the claim check sees it; set per test. */
class FakeProcesses {
  answer: KillAnswer = 'alive';

  install(): void {
    const uptime = mock.method(os, 'uptime', (): number => UPTIME_SECONDS);
    const kill = mock.method(process, 'kill', (pid: number): true => {
      if (this.answer === 'alive') return true;
      throw Object.assign(new Error(`kill ${pid}: ${this.answer}`), { code: this.answer });
    });
    assert.equal(os.uptime, uptime, 'os.uptime is the stub');
    assert.equal(process.kill, kill, 'process.kill is the stub');
    // The shared helper reads the same `node:os` object: its boot time follows the stub.
    assert.equal(currentBootTimeMs(PREFLIGHT_NOW_MS), PREFLIGHT_NOW_MS - UPTIME_SECONDS * 1000);
  }
}

async function writeClaim(platformRoot: string, text: string): Promise<PublishAttemptId> {
  const attemptId = newUlid(Date.parse('2026-11-20T15:00:00.000Z'));
  await mkdir(publishAttemptDirectory(platformRoot, attemptId), { recursive: true, mode: 0o700 });
  await writeFile(publishFilePath(platformRoot, attemptId, 'claim'), text);
  return attemptId;
}

describe('PublishAttemptFiles.claimant (finding C1)', () => {
  let root: string;
  let platformRoot: string;
  let files: PublishAttemptFiles;
  let processes: FakeProcesses;

  beforeEach(async () => {
    processes = new FakeProcesses();
    processes.install();
    root = await mkdtemp(join(tmpdir(), 'watcher-claimant-'));
    const dataHome = new DataHome(root);
    platformRoot = dataHome.platform;
    await mkdir(platformRoot, { recursive: true, mode: 0o700 });
    files = new PublishAttemptFiles(platformRoot, SELF_PID, dataHome);
  });

  afterEach(async () => {
    mock.restoreAll();
    await rm(root, { recursive: true, force: true });
  });

  it('reports a claim of a live pid of this user under this boot as live', async () => {
    const attemptId = await writeClaim(platformRoot, `${OTHER_PID} ${currentBootTimeMs()}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'live', pid: OTHER_PID });
  });

  it('treats a boot time inside the tolerance as this boot', async () => {
    const attemptId = await writeClaim(platformRoot, `${OTHER_PID} ${currentBootTimeMs() + 30_000}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'live', pid: OTHER_PID });
  });

  it('treats a claim written under an earlier boot as dead, even when its pid answers now', async () => {
    const attemptId = await writeClaim(platformRoot, `${OTHER_PID} ${currentBootTimeMs() - WEEK_MS}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'dead' });
  });

  it('treats a claim whose pid belongs to another user (EPERM) as dead', async () => {
    processes.answer = 'EPERM';
    const attemptId = await writeClaim(platformRoot, `${OTHER_PID} ${currentBootTimeMs()}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'dead' });
  });

  it('treats a claim whose pid no longer exists (ESRCH) as dead', async () => {
    processes.answer = 'ESRCH';
    const attemptId = await writeClaim(platformRoot, `${OTHER_PID} ${currentBootTimeMs()}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'dead' });
  });

  it("treats a claim naming this process's own pid as dead (a reused pid), even under this boot", async () => {
    const attemptId = await writeClaim(platformRoot, `${SELF_PID} ${currentBootTimeMs()}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'dead' });
  });

  it('treats a claim written before boot times were recorded (a bare pid) as dead', async () => {
    const attemptId = await writeClaim(platformRoot, `${OTHER_PID}\n`);

    assert.deepEqual(await files.claimant(attemptId), { status: 'dead' });
  });

  it('treats an unreadable claim as dead and a missing one as absent', async () => {
    const unreadable = await writeClaim(platformRoot, 'not a stamp\n');

    assert.deepEqual(await files.claimant(unreadable), { status: 'dead' });
    assert.deepEqual(await files.claimant(newUlid(Date.parse('2026-11-20T15:00:00.000Z'))), { status: 'absent' });
  });

  it('writes its own claim as this pid and this boot', async () => {
    const attemptId = newUlid(Date.parse('2026-11-20T15:00:00.000Z'));
    await mkdir(publishAttemptDirectory(platformRoot, attemptId), { recursive: true, mode: 0o700 });

    assert.equal(await files.claim(attemptId), 'claimed');

    // Read by another process of this user under the same boot, the claim is live.
    const otherReader = new PublishAttemptFiles(platformRoot, OTHER_PID, new DataHome(root));
    assert.deepEqual(await otherReader.claimant(attemptId), { status: 'live', pid: SELF_PID });
  });
});

describe('PublishStep start-up sweep with claim liveness (finding C1)', () => {
  let harness: PlatformHarness;
  let processes: FakeProcesses;

  beforeEach(async () => {
    processes = new FakeProcesses();
    processes.install();
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    mock.restoreAll();
    await harness.close();
  });

  async function uploadingAttemptClaimedBy(stamp: string): Promise<PublishAttemptId> {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    await writeFile(publishFilePath(harness.platformRoot, request.attemptId, 'claim'), stamp);
    await writePublishState(harness.platformRoot, {
      format: 1,
      attemptId: request.attemptId,
      state: 'uploading',
      since: harness.clock.now().toISOString(),
      bytesSent: 1024,
      bytesTotal: request.artifact.sizeBytes,
      reasonId: null,
      platformVideoId: null,
      platformMediaId: null,
      publishedAt: null,
      followUntil: null,
    });
    return request.attemptId;
  }

  it('closes an uploading attempt claimed under an earlier boot as watcher-interrupted, though its pid answers', async () => {
    const attemptId = await uploadingAttemptClaimedBy(`${OTHER_PID} ${currentBootTimeMs() - WEEK_MS}\n`);

    await harness.publish.sweep();

    const state = await stateOf(harness, attemptId);
    assert.equal(state?.state, 'failed');
    assert.equal(state?.reasonId, 'watcher-interrupted');
    assert.equal(harness.clients.youtube.calls.upload, 0);
  });

  it('closes an uploading attempt whose claimant pid is another user\'s (EPERM)', async () => {
    processes.answer = 'EPERM';
    const attemptId = await uploadingAttemptClaimedBy(`${OTHER_PID} ${currentBootTimeMs()}\n`);

    await harness.publish.sweep();

    assert.equal((await stateOf(harness, attemptId))?.reasonId, 'watcher-interrupted');
  });

  it('leaves an uploading attempt alone while its same-boot claimant is live', async () => {
    const attemptId = await uploadingAttemptClaimedBy(`${OTHER_PID} ${currentBootTimeMs()}\n`);

    await harness.publish.sweep();

    assert.equal((await stateOf(harness, attemptId))?.state, 'uploading');
    assert.deepEqual(
      harness.events.ofType('publish.claim-held').map((event) => 'ownerPid' in event && event.ownerPid),
      [OTHER_PID],
    );
  });
});
