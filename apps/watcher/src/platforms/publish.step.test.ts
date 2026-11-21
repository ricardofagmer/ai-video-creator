import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { PlatformClientError, type PlatformClientErrorReason } from '@studio/core/platforms';
import { type PublishFailureReason, type PublishRequestFile, type PublishStateFile, type RunPublicationLine } from '@studio/shared/platforms';
import { claimPublishAttempt, writePublishState } from '@studio/shared/platforms/files';
import { appendRunPublicationLine } from '@studio/shared/run-files';
import { runFileNames } from '@studio/shared/run-format';
import {
  DEAD_PID,
  HOUR_MS,
  SENTINEL_CAPTION,
  SENTINEL_TAG,
  SENTINEL_TITLE,
  queuePublishRequest,
  setGates,
} from './platform-fixtures.harness.test';
import {
  createPlatformHarness,
  prepareRun,
  publicationLines,
  stateOf,
  type PlatformHarness,
} from './platform-step.harness.test';

/*
 * The publish step's claim, upload and publication record (SPEC 0007 section 5.5, AC 48, AC 49,
 * AC 56 upload, OD8, K5), through the real step over an `fs.mkdtemp` data home with mock-mode
 * accounts and a counting client double.
 */

describe('PublishStep: claim, one upload and publications.jsonl', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('appends upload-started and writes uploading before the first byte, then closes with published', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    const seenAtUpload: { events: string[]; state: string | null }[] = [];
    harness.clients.youtube.onUpload = async () => {
      const lines = await publicationLines(harness, run.runId);
      seenAtUpload.push({ events: lines.map((line) => line.event), state: (await stateOf(harness, request.attemptId))?.state ?? null });
    };

    assert.equal(await harness.publish.claimNext(), true);

    assert.deepEqual(seenAtUpload, [{ events: ['upload-started'], state: 'uploading' }]);
    const lines = await publicationLines(harness, run.runId);
    assert.deepEqual(lines.map((line) => line.event), ['upload-started', 'published']);
    const [started, closing] = lines;
    assert.equal(started?.sizeBytes, run.sizeBytes);
    assert.equal(started?.artifactSha256, run.sha256);
    assert.deepEqual(started?.biometricRefs, ['voz-teste@3']);
    assert.equal(closing?.platformVideoId, request.attemptId.slice(-11));
    const state = await stateOf(harness, request.attemptId);
    assert.equal(state?.state, 'published');
    assert.equal(state?.bytesSent, run.sizeBytes);
  });

  it('keeps the owner text out of publications.jsonl', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });

    await harness.publish.claimNext();

    const text = await readFile(join(run.runDir, runFileNames.publications), 'utf8');
    for (const ownerText of [SENTINEL_TITLE, SENTINEL_CAPTION, SENTINEL_TAG]) assert.equal(text.includes(ownerText), false);
  });

  it('records a TikTok upload as sent-to-inbox with its closing line', async () => {
    await setGates(harness.platformRoot, { tiktok: { metrics: 'enabled', publish: 'enabled' } }, harness.clock.now());
    const { connectionId, run } = await prepareRun(harness, 'tiktok');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'tiktok', connectionId, at: harness.clock.now() });

    await harness.publish.claimNext();

    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'sent-to-inbox']);
    const state = await stateOf(harness, request.attemptId);
    assert.equal(state?.state, 'sent-to-inbox');
    assert.equal(state?.followUntil, new Date(harness.clock.now().getTime() + 24 * HOUR_MS).toISOString());
  });

  it('never uploads a published attempt again on later idle ticks (K5)', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });

    await harness.publish.claimNext();
    harness.clock.advance(HOUR_MS);
    assert.equal(await harness.publish.claimNext(), false);

    assert.equal(harness.clients.youtube.calls.upload, 1);
  });

  it('closes an Instagram request failed / gate-closed before any client call (OD8)', async () => {
    await setGates(harness.platformRoot, { instagram: { metrics: 'enabled', publish: 'enabled' } }, harness.clock.now());
    const { connectionId, run } = await prepareRun(harness, 'instagram');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'instagram', connectionId, at: harness.clock.now() });

    await harness.publish.claimNext();

    const state = await stateOf(harness, request.attemptId);
    assert.equal(state?.state, 'failed');
    assert.equal(state?.reasonId, 'gate-closed');
    assert.deepEqual(harness.clients.instagram.calls, { refresh: 0, upload: 0, uploadStatus: 0, fetchMetrics: 0 });
    assert.deepEqual(await publicationLines(harness, run.runId), []);
  });
});

describe('PublishStep: no attempt is sent twice (AC 48, K5)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('marks an uploading attempt with no live claimant failed / watcher-interrupted at start and never resumes it', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    // What a watcher that died mid-upload leaves: its claim, the upload-started line, `uploading`.
    await claimPublishAttempt(harness.platformRoot, request.attemptId, DEAD_PID);
    await appendRunPublicationLine(run.runDir, uploadStartedLine(request, harness.clock.now()));
    await writePublishState(harness.platformRoot, uploadingState(request, harness.clock.now()));

    await harness.publish.sweep();
    await harness.publish.claimNext();

    const state = await stateOf(harness, request.attemptId);
    assert.equal(state?.state, 'failed');
    assert.equal(state?.reasonId, 'watcher-interrupted');
    const lines = await publicationLines(harness, run.runId);
    assert.deepEqual(lines.map((line) => line.event), ['upload-started', 'failed']);
    assert.equal(lines[1]?.reasonId, 'watcher-interrupted');
    assert.equal(harness.clients.youtube.calls.upload, 0);
  });

  it('closes an attempt whose dead claimant appended upload-started but never wrote a state', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    await claimPublishAttempt(harness.platformRoot, request.attemptId, DEAD_PID);
    await appendRunPublicationLine(run.runDir, uploadStartedLine(request, harness.clock.now()));

    await harness.publish.sweep();
    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, request.attemptId))?.reasonId, 'watcher-interrupted');
    const lines = await publicationLines(harness, run.runId);
    assert.deepEqual(lines.map((line) => line.event), ['upload-started', 'failed']);
    assert.equal(harness.clients.youtube.calls.upload, 0);
  });

  it('leaves an attempt claimed by a live process alone, in the sweep and in claimNext', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    assert.equal(await claimPublishAttempt(harness.platformRoot, request.attemptId, process.ppid), 'claimed');

    await harness.publish.sweep();
    assert.equal(await harness.publish.claimNext(), false);

    assert.equal(await stateOf(harness, request.attemptId), null);
    assert.equal(harness.clients.youtube.calls.upload, 0);
    assert.ok(harness.events.ofType('publish.claim-held').length >= 1);
  });

  it('lets only one of two racing watchers claim and upload a request (O_EXCL claim)', async () => {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    const other = await createPlatformHarness({ root: harness.root, clock: harness.clock });

    try {
      const claimed = await Promise.all([harness.publish.claimNext(), other.publish.claimNext()]);
      assert.equal(claimed.filter(Boolean).length, 1);
      assert.equal(harness.clients.youtube.calls.upload + other.clients.youtube.calls.upload, 1);
    } finally {
      await other.close();
    }
    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'published']);
  });
});

function uploadStartedLine(request: PublishRequestFile, at: Date): RunPublicationLine {
  return {
    at: at.toISOString(),
    attemptId: request.attemptId,
    platform: request.platform,
    mode: request.mode,
    event: 'upload-started',
    sizeBytes: request.artifact.sizeBytes,
    artifactSha256: request.artifact.sha256,
    visibility: request.metadata.visibility,
    biometricRefs: request.biometric.refs,
    platformVideoId: null,
    reasonId: null,
  };
}

function uploadingState(request: PublishRequestFile, at: Date): PublishStateFile {
  return {
    format: 1,
    attemptId: request.attemptId,
    state: 'uploading',
    since: at.toISOString(),
    bytesSent: 1024,
    bytesTotal: request.artifact.sizeBytes,
    reasonId: null,
    platformVideoId: null,
    platformMediaId: null,
    publishedAt: null,
    followUntil: null,
  };
}

describe('PublishStep: an upload fault fails the attempt and is never retried (AC 56)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const faults: readonly { reason: PlatformClientErrorReason; expected: PublishFailureReason; transport: boolean }[] = [
    { reason: 'rate-limited', expected: 'rate-limited', transport: false },
    { reason: 'quota-exhausted', expected: 'quota-exhausted', transport: false },
    { reason: 'platform-unavailable', expected: 'platform-unavailable', transport: false },
    { reason: 'network', expected: 'network', transport: true },
  ];

  for (const fault of faults) {
    it(`fails with ${fault.expected} after one upload call and sends nothing again on a ${fault.reason} answer`, async () => {
      const { connectionId, run } = await prepareRun(harness, 'youtube');
      const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
      harness.clients.youtube.uploadFailure = new PlatformClientError('youtube', 'upload', fault.reason, {
        transport: fault.transport,
        retryAfterSeconds: 60,
      });

      await harness.publish.claimNext();
      harness.clock.advance(2 * HOUR_MS);
      await harness.publish.sweep();
      await harness.publish.claimNext();

      const state = await stateOf(harness, request.attemptId);
      assert.equal(state?.state, 'failed');
      assert.equal(state?.reasonId, fault.expected);
      assert.equal(harness.clients.youtube.calls.upload, 1);
      assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'failed']);
    });
  }
});
