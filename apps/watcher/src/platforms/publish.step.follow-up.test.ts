import assert from 'node:assert/strict';
import { readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { HealthReader, PlatformClientError } from '@studio/core/platforms';
import { publishBounds, type Platform, type PublishRequestFile } from '@studio/shared/platforms';
import { accountFilePath, acquireTokenLock, releaseTokenLock } from '@studio/shared/platforms/files';
import { corruptHealthFilePath } from './health-file.set-aside';
import { HOUR_MS, queuePublishRequest, setGates, type ApprovedRun } from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, publicationLines, stateOf, type PlatformHarness } from './platform-step.harness.test';
import { INBOX_CHECK_EVERY_MS, MAX_TOKEN_WAITS } from './publish-follow-up';

/*
 * Status checks after the last byte (SPEC 0007 section 5.5 "finish" and "TikTok follow-up"),
 * through the real publish step: `claimNext` runs one due check when it claims nothing. Findings C2
 * (processing ends by check count only, never by wall clock; the inbox window needs one query before
 * it closes; a lock-held token wait is not a check), C11 (an inbox draft later published appends
 * a `published` line), R1 (a token that cannot be had never keeps an attempt followed for ever,
 * nor retried on every tick past `followUntil`; only a failed acquisition stands for the window's
 * query) and R7 (an unreadable `health.json` blocks one tick, then is moved aside).
 */

const PROCESSING_REF = 'processing-ref-1';
/** A TikTok post id the platform reports once the inbox draft is published. */
const TIKTOK_POST_ID = '7301234567890123456';
/** A pid no test ever signals: `process.kill` is replaced while a lock names it. */
const LOCK_OWNER_PID = 4_242_424;
/** More refresh failures than any test can use up, so every token acquisition fails. */
const ENDLESS_FAILURES = MAX_TOKEN_WAITS + 10;

interface Uploaded {
  request: PublishRequestFile;
  run: ApprovedRun;
}

describe('PublishFollowUp through PublishStep (findings C2, C11)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    mock.restoreAll();
    await harness.close();
  });

  /** A YouTube upload the platform answered `processing`; one status check is then due a minute later. */
  async function uploadToProcessing(): Promise<Uploaded> {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    harness.clients.youtube.uploadOutcome = () => ({ state: 'processing', uploadRef: PROCESSING_REF });
    assert.equal(await harness.publish.claimNext(), true);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing');
    return { request, run };
  }

  /** From now on every token refresh fails with a network error (a refresh outage), as R1 describes. */
  function failEveryRefresh(platform: Platform): void {
    for (let failure = 0; failure < ENDLESS_FAILURES; failure += 1) harness.clients[platform].refreshFailures.push(new PlatformClientError(platform, 'refresh', 'network'));
  }

  /** `LOCK_OWNER_PID` answers as a live process of this user, every other pid as gone; fails closed when not installed. */
  function stubLockOwnerAlive(): void {
    const kill = mock.method(process, 'kill', (pid: number): true => {
      if (pid === LOCK_OWNER_PID) return true;
      throw Object.assign(new Error(`kill ${pid}: ESRCH`), { code: 'ESRCH' });
    });
    assert.equal(process.kill, kill, 'process.kill is the stub before any lock is read');
  }

  /** A TikTok upload closed `sent-to-inbox`, followed until 24 hours later. */
  async function uploadToInbox(): Promise<Uploaded> {
    await setGates(harness.platformRoot, { tiktok: { metrics: 'enabled', publish: 'enabled' } }, harness.clock.now());
    const { connectionId, run } = await prepareRun(harness, 'tiktok');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'tiktok', connectionId, at: harness.clock.now() });
    assert.equal(await harness.publish.claimNext(), true);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox');
    return { request, run };
  }

  it('still checks a processing attempt after a gap longer than 30 minutes instead of giving up unchecked (C2)', async () => {
    const { request } = await uploadToProcessing();
    // The Mac slept for two hours between the upload and the next idle tick.
    harness.clock.advance(2 * HOUR_MS);

    assert.equal(await harness.publish.claimNext(), false);

    assert.equal(harness.clients.youtube.calls.uploadStatus, 1);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing');
  });

  it('gives up as outcome-unknown only after publishBounds.processingChecks status queries (C2)', async () => {
    const { request, run } = await uploadToProcessing();

    for (let check = 0; check < publishBounds.processingChecks; check += 1) {
      harness.clock.advance(publishBounds.processingCheckEveryMs);
      await harness.publish.claimNext();
    }
    assert.equal(harness.clients.youtube.calls.uploadStatus, publishBounds.processingChecks);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing', 'still followed after the last allowed query');

    harness.clock.advance(publishBounds.processingCheckEveryMs);
    await harness.publish.claimNext();

    assert.equal(harness.clients.youtube.calls.uploadStatus, publishBounds.processingChecks, 'no query beyond the bound');
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'outcome-unknown');
    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'outcome-unknown']);
  });

  it('does not count a check while token.lock is held by another process (C2)', async () => {
    const { request } = await uploadToProcessing();
    const kill = mock.method(process, 'kill', (pid: number): true => {
      if (pid === LOCK_OWNER_PID) return true;
      throw Object.assign(new Error(`kill ${pid}: ESRCH`), { code: 'ESRCH' });
    });
    assert.equal(process.kill, kill, 'process.kill is the stub before any lock is read');
    // An hour later the token needs a refresh, which needs token.lock, which another process holds.
    harness.clock.advance(HOUR_MS);
    const lockPath = accountFilePath(harness.platformRoot, 'youtube', 'tokenLock');
    const held = await acquireTokenLock({ platformRoot: harness.platformRoot, platform: 'youtube', pid: LOCK_OWNER_PID, nowMs: harness.clock.now().getTime() });
    assert.equal(held.state, 'acquired');

    for (let tick = 0; tick < publishBounds.processingChecks + 5; tick += 1) {
      harness.clock.advance(publishBounds.processingCheckEveryMs);
      // The holder keeps working: its lock stays fresh by the injected clock.
      await utimes(lockPath, harness.clock.now(), harness.clock.now());
      await harness.publish.claimNext();
    }
    assert.equal(harness.clients.youtube.calls.uploadStatus, 0);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing', 'lock-held waits never used up the checks');

    await releaseTokenLock({ platformRoot: harness.platformRoot, platform: 'youtube', pid: LOCK_OWNER_PID });
    harness.clock.advance(publishBounds.processingCheckEveryMs);
    await harness.publish.claimNext();

    assert.equal(harness.clients.youtube.calls.uploadStatus, 1);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing');
  });

  it('makes at least one status query before the inbox window closes, even when the first tick comes after followUntil (C2)', async () => {
    const { request, run } = await uploadToInbox();
    harness.clients.tiktok.statusAnswer = { state: 'sent-to-inbox' };
    harness.clock.advance(publishBounds.inboxFollowMs + HOUR_MS);

    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.uploadStatus, 1);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox', 'not closed before its one query');

    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.uploadStatus, 1);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'inbox-unconfirmed');
    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'sent-to-inbox']);
  });

  it('appends a published line when a TikTok inbox draft is later published (C11)', async () => {
    const { request, run } = await uploadToInbox();
    harness.clients.tiktok.statusAnswer = {
      state: 'published',
      platformVideoId: TIKTOK_POST_ID,
      platformMediaId: null,
      publishedAt: harness.clock.now().toISOString(),
    };
    harness.clock.advance(INBOX_CHECK_EVERY_MS);

    await harness.publish.claimNext();

    const state = await stateOf(harness, request.attemptId);
    assert.equal(state?.state, 'published');
    assert.equal(state?.platformVideoId, TIKTOK_POST_ID);
    const lines = await publicationLines(harness, run.runId);
    assert.deepEqual(lines.map((line) => line.event), ['upload-started', 'sent-to-inbox', 'published']);
    assert.equal(lines[2]?.platformVideoId, TIKTOK_POST_ID);
  });

  it('counts a failed token acquisition past followUntil as the window query, then gives up instead of retrying every tick (R1)', async () => {
    const { request, run } = await uploadToInbox();
    // The token expires within the hour, so the first check past the window needs a refresh, which fails.
    harness.clock.advance(publishBounds.inboxFollowMs + HOUR_MS);
    failEveryRefresh('tiktok');
    const refreshesBefore = harness.clients.tiktok.calls.refresh;

    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.refresh - refreshesBefore, 1);
    assert.equal(harness.clients.tiktok.calls.uploadStatus, 0);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox');

    await harness.publish.claimNext();
    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.refresh - refreshesBefore, 1, 'no second token attempt on the following ticks');
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'inbox-unconfirmed');
    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'sent-to-inbox']);
  });

  it('gives a processing attempt up as outcome-unknown after MAX_TOKEN_WAITS failed token acquisitions, never querying (R1)', async () => {
    const { request, run } = await uploadToProcessing();
    harness.clock.advance(HOUR_MS);
    failEveryRefresh('youtube');
    const refreshesBefore = harness.clients.youtube.calls.refresh;

    for (let tick = 0; tick < MAX_TOKEN_WAITS; tick += 1) {
      harness.clock.advance(publishBounds.processingCheckEveryMs);
      await harness.publish.claimNext();
    }
    assert.equal(harness.clients.youtube.calls.refresh - refreshesBefore, MAX_TOKEN_WAITS, 'one token attempt per processing interval');
    assert.equal(harness.clients.youtube.calls.uploadStatus, 0);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing');

    await harness.publish.claimNext();

    assert.equal(harness.clients.youtube.calls.refresh - refreshesBefore, MAX_TOKEN_WAITS, 'the give-up needs no token');
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'outcome-unknown');
    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'outcome-unknown']);
  });

  it('retries a failed token acquisition only at the processing interval, not on every tick (R1)', async () => {
    await uploadToProcessing();
    harness.clock.advance(HOUR_MS);
    failEveryRefresh('youtube');
    const refreshesBefore = harness.clients.youtube.calls.refresh;

    await harness.publish.claimNext();
    for (let tick = 0; tick < 5; tick += 1) {
      harness.clock.advance(1_000);
      await harness.publish.claimNext();
    }

    assert.equal(harness.clients.youtube.calls.refresh - refreshesBefore, 1);
  });

  it('does not count a token.lock wait past followUntil as the window query, so the query is still made on a later tick (R1)', async () => {
    const { request, run } = await uploadToInbox();
    harness.clients.tiktok.statusAnswer = { state: 'sent-to-inbox' };
    stubLockOwnerAlive();
    // Past the window the token needs a refresh, which needs token.lock, which another process holds.
    harness.clock.advance(publishBounds.inboxFollowMs + HOUR_MS);
    const lockPath = accountFilePath(harness.platformRoot, 'tiktok', 'tokenLock');
    const held = await acquireTokenLock({ platformRoot: harness.platformRoot, platform: 'tiktok', pid: LOCK_OWNER_PID, nowMs: harness.clock.now().getTime() });
    assert.equal(held.state, 'acquired');
    await utimes(lockPath, harness.clock.now(), harness.clock.now());

    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.uploadStatus, 0);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox');

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox', 'the lock wait did not stand for the window query, so no give-up on this tick');

    await releaseTokenLock({ platformRoot: harness.platformRoot, platform: 'tiktok', pid: LOCK_OWNER_PID });
    harness.clock.advance(INBOX_CHECK_EVERY_MS);
    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.uploadStatus, 1, 'the window query is made once the lock frees');
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox');

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, request.attemptId))?.state, 'inbox-unconfirmed');
    assert.deepEqual((await publicationLines(harness, run.runId)).map((line) => line.event), ['upload-started', 'sent-to-inbox']);
  });

  it('does not count an unreadable health.json past followUntil as the window query (R1, R7)', async () => {
    const { request } = await uploadToInbox();
    harness.clients.tiktok.statusAnswer = { state: 'sent-to-inbox' };
    harness.clock.advance(publishBounds.inboxFollowMs + HOUR_MS);
    await writeFile(accountFilePath(harness.platformRoot, 'tiktok', 'health'), '{"token":');

    await harness.publish.claimNext();
    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.uploadStatus, 0);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'sent-to-inbox', 'no give-up right after a health-unknown wait');

    harness.clock.advance(INBOX_CHECK_EVERY_MS);
    await harness.publish.claimNext();

    assert.equal(harness.clients.tiktok.calls.uploadStatus, 1);
  });

  it('blocks a processing check for one tick on an unreadable health.json, moves it to health.json.corrupt and checks on the next tick (R7)', async () => {
    const { request } = await uploadToProcessing();
    const healthPath = accountFilePath(harness.platformRoot, 'youtube', 'health');
    await writeFile(healthPath, '{"token":');

    harness.clock.advance(publishBounds.processingCheckEveryMs);
    await harness.publish.claimNext();

    assert.equal(harness.clients.youtube.calls.uploadStatus, 0);
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing', 'waiting, not failed');
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1);
    await assert.rejects(stat(healthPath), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT');
    const asidePath = corruptHealthFilePath(harness.platformRoot, 'youtube');
    assert.equal(await readFile(asidePath, 'utf8'), '{"token":');
    assert.equal((await stat(asidePath)).mode & 0o777, 0o600);

    harness.clock.advance(publishBounds.processingCheckEveryMs);
    await harness.publish.claimNext();

    assert.equal(harness.clients.youtube.calls.uploadStatus, 1, 'the next tick reads no health file and checks');
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing');
    assert.equal(harness.events.ofType('platform.health-unreadable').length, 1, 'logged once for the outage');
  });

  it('fails a processing attempt as token-revoked on the tick after the recovery when the token is still revoked (R7)', async () => {
    const { request } = await uploadToProcessing();
    await writeFile(accountFilePath(harness.platformRoot, 'youtube', 'health'), '{"token":"needs-reconnect"');
    harness.clock.advance(publishBounds.processingCheckEveryMs);
    await harness.publish.claimNext();
    assert.equal((await stateOf(harness, request.attemptId))?.state, 'processing');
    // The blocked call dropped the cached token, so the next one starts from the expired mock seed
    // (section 5.8) and refreshes; that refresh is refused for good.
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'token-revoked'));

    harness.clock.advance(publishBounds.processingCheckEveryMs);
    await harness.publish.claimNext();

    const state = await stateOf(harness, request.attemptId);
    assert.equal(state?.state, 'failed');
    assert.equal(state?.reasonId, 'token-revoked');
    assert.equal(harness.clients.youtube.calls.uploadStatus, 0);
    const health = await new HealthReader(harness.platformRoot).read('youtube');
    assert.equal(health?.token, 'needs-reconnect', 'the block came back from the token call');
  });
});
