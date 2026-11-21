import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type PublishStateFile } from '@studio/shared/platforms';
import { claimPublishAttempt, writePublishState } from '@studio/shared/platforms/files';
import { appendRunPublicationLine, newUlid } from '@studio/shared/run-files';
import { mockYoutubeVideoId } from '../clients/mock/mock-data';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platform-harness.harness.test';
import { PlatformRefusedError, PublishRequestWriteFailedError } from '../platforms.errors';
import { connectMock, openAllGates, publishBody, requestCommand } from '../publish-scenario.harness.test';
import { seedFixtureCatalog, seedRun, type SeededRun } from '../run-fixture.harness.test';
import { CancelPublishCommand, SyncPublishAttemptsCommand } from './platform.commands';

/*
 * PublishAttemptSync (SPEC 0007 section 5.4 "Result", AC 51) and RequestPublish step 9: a
 * `published` state.json moves the row and links a `run_publications` row in one transaction; an
 * id that cannot rebuild a canonical URL leaves the attempt published and unlinked; a request
 * file that cannot be written leaves the row failed so no upload follows. Finding C4: a cancelled
 * row whose claim exists and whose state.json shows an upload follows the file, unless that would
 * open a second attempt for the pair, which is deferred and logged. The rest of the R2 step 7 cases
 * live in `request-publish.withdrawn-upload.test.ts`.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;
let graph: PlatformGraph;
let run: SeededRun;

function publishedState(attemptId: string, platformVideoId: string): PublishStateFile {
  return {
    format: 1,
    attemptId,
    state: 'published',
    since: '2026-11-20T10:30:00.000Z',
    bytesSent: run.finalBytes,
    bytesTotal: run.finalBytes,
    reasonId: null,
    platformVideoId,
    platformMediaId: null,
    publishedAt: '2026-11-20T10:30:00.000Z',
    followUntil: null,
  };
}

async function requestAttempt(): Promise<string> {
  const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
  return created.attempt.attemptId;
}

describe('PublishAttemptSync', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-sync', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('links a published mock attempt to one run_publications row with origin mock, its attemptId and the canonical URL', async () => {
    const attemptId = await requestAttempt();
    const videoId = mockYoutubeVideoId(attemptId);
    await writePublishState(harness.platformRoot, publishedState(attemptId, videoId));

    const summary = await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    assert.deepEqual(summary, { open: 1, updated: 1, expired: 0, linked: 1 });
    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'published');
    const publications = await harness.prisma.runPublication.findMany({ where: { runId: run.runId } });
    assert.equal(publications.length, 1);
    const [publication] = publications;
    assert.ok(publication);
    assert.equal(publication.origin, 'mock');
    assert.equal(publication.attemptId, attemptId);
    assert.equal(publication.platformVideoId, videoId);
    assert.equal(publication.url, `https://www.youtube.com/watch?v=${videoId}`);
    assert.equal(attempt.publicationId, publication.id);
  });

  it('runs a second sync without moving or linking anything again', async () => {
    const attemptId = await requestAttempt();
    await writePublishState(harness.platformRoot, publishedState(attemptId, mockYoutubeVideoId(attemptId)));
    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    const again = await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    assert.deepEqual(again, { open: 0, updated: 0, expired: 0, linked: 0 });
    assert.equal(await harness.prisma.runPublication.count({ where: { runId: run.runId } }), 1);
  });

  it('refuses a later request for the run once the studio published it (step 7)', async () => {
    const attemptId = await requestAttempt();
    await writePublishState(harness.platformRoot, publishedState(attemptId, mockYoutubeVideoId(attemptId)));
    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-published',
    );
  });

  it('leaves an attempt whose id cannot rebuild a canonical URL published and unlinked, logging link-skipped', async () => {
    const attemptId = await requestAttempt();
    await writePublishState(harness.platformRoot, publishedState(attemptId, 'not a video id'));

    const summary = await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    assert.equal(summary.updated, 1);
    assert.equal(summary.linked, 0);
    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'published');
    assert.equal(attempt.publicationId, null);
    assert.equal(await harness.prisma.runPublication.count({ where: { runId: run.runId } }), 0);
    assert.match(harness.logs.text(), /publish\.link-skipped/);
    assert.match(harness.logs.text(), /url-not-buildable/);
  });

  it('still refuses a second request after an unlinked published attempt (step 7 counts published attempts)', async () => {
    const attemptId = await requestAttempt();
    await writePublishState(harness.platformRoot, publishedState(attemptId, 'not a video id'));
    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-published',
    );
  });
});

/** `state.json` of an upload in flight, as the watcher writes it after its claim. */
function uploadingState(attemptId: string): PublishStateFile {
  return {
    format: 1,
    attemptId,
    state: 'uploading',
    since: '2026-11-20T10:10:00.000Z',
    bytesSent: 0,
    bytesTotal: run.finalBytes,
    reasonId: null,
    platformVideoId: null,
    platformMediaId: null,
    publishedAt: null,
    followUntil: null,
  };
}

/** A terminal `failed` state.json after `bytesSent` bytes (zero: the watcher failed before the first byte). */
function failedState(attemptId: string, bytesSent: number): PublishStateFile {
  return {
    format: 1,
    attemptId,
    state: 'failed',
    since: '2026-11-20T10:12:00.000Z',
    bytesSent,
    bytesTotal: run.finalBytes,
    reasonId: 'token-revoked',
    platformVideoId: null,
    platformMediaId: null,
    publishedAt: null,
    followUntil: null,
  };
}

/** A queued attempt the owner cancels before the watcher's claim lands. */
async function cancelledAttempt(): Promise<string> {
  const attemptId = await requestAttempt();
  await graph.cancelPublish.execute(new CancelPublishCommand({ runId: run.runId, attemptId, correlationId: null }));
  return attemptId;
}

describe('PublishAttemptSync reconciles a withdrawn attempt whose upload happened (C4)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-reconcile', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('links a cancelled attempt that was claimed and published anyway, so step 7 refuses a duplicate', async () => {
    const attemptId = await cancelledAttempt();
    // The claim raced the cancel: the watcher claimed and uploaded.
    assert.equal(await claimPublishAttempt(harness.platformRoot, attemptId, process.pid), 'claimed');
    await writePublishState(harness.platformRoot, publishedState(attemptId, mockYoutubeVideoId(attemptId)));

    const summary = await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    assert.equal(summary.linked, 1);
    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'published');
    assert.notEqual(attempt.publicationId, null);
    assert.equal(await harness.prisma.runPublication.count({ where: { runId: run.runId, attemptId } }), 1);
    assert.match(harness.logs.text(), /publish\.state-reconciled/);
    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-published',
    );
  });

  it('reopens a cancelled attempt whose claimed upload is still running, so a new request is in progress', async () => {
    const attemptId = await cancelledAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await writePublishState(harness.platformRoot, uploadingState(attemptId));

    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'uploading');
    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-in-progress',
    );
  });

  it('leaves a cancelled attempt alone when its state.json shows an upload but no claim exists', async () => {
    const attemptId = await cancelledAttempt();
    await writePublishState(harness.platformRoot, uploadingState(attemptId));

    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'cancelled');
  });

  it('refuses a new attempt, writing nothing, while a cancelled attempt has a claim and an upload in flight, before any sync (R2)', async () => {
    const attemptId = await cancelledAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await writePublishState(harness.platformRoot, uploadingState(attemptId));

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-in-progress',
    );

    assert.equal(await harness.prisma.publicationAttempt.count({ where: { runId: run.runId } }), 1, 'no second attempt row');
    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'cancelled', 'the request itself reconciles nothing');
  });

  it('refuses a new attempt as already published while a cancelled attempt has a claim and a published state.json (R2)', async () => {
    const attemptId = await cancelledAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await writePublishState(harness.platformRoot, publishedState(attemptId, mockYoutubeVideoId(attemptId)));

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-published',
    );
    assert.equal(await harness.prisma.publicationAttempt.count({ where: { runId: run.runId } }), 1);
  });

  it('accepts a new attempt when the cancelled attempt has no claim, or its claimed upload failed (R2)', async () => {
    const unclaimed = await cancelledAttempt();
    await writePublishState(harness.platformRoot, uploadingState(unclaimed));
    const afterUnclaimed = await requestAttempt();
    await graph.cancelPublish.execute(new CancelPublishCommand({ runId: run.runId, attemptId: afterUnclaimed, correlationId: null }));
    await claimPublishAttempt(harness.platformRoot, afterUnclaimed, process.pid);
    await writePublishState(harness.platformRoot, failedState(afterUnclaimed, run.finalBytes));

    const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));

    assert.equal(created.outcome, 'created', 'a new click after a failed upload is a new attempt (section 5.4)');
  });

  it('defers, and logs, a reconcile that would open a second attempt for the pair, then takes the terminal state once the upload finishes', async () => {
    const attemptId = await cancelledAttempt();
    // The newer attempt was accepted before the claim landed, so step 7 could not see the upload.
    const newer = await requestAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await writePublishState(harness.platformRoot, uploadingState(attemptId));
    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));
    assert.equal(
      (await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } })).state,
      'cancelled',
      'the row waits for the file to reach a terminal state',
    );
    assert.equal((await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: newer } })).state, 'queued');
    assert.match(harness.logs.text(), /publish\.reconcile-deferred/);
    await writePublishState(harness.platformRoot, publishedState(attemptId, mockYoutubeVideoId(attemptId)));

    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'published');
    assert.equal(await harness.prisma.runPublication.count({ where: { runId: run.runId, attemptId } }), 1);
  });

  it('leaves a cancelled attempt alone when its claimed state.json failed before any byte (R3)', async () => {
    const attemptId = await cancelledAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await writePublishState(harness.platformRoot, failedState(attemptId, 0));

    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'cancelled', 'no upload-started line and no byte: nothing left the machine');
  });

  it('reconciles a cancelled attempt to failed when its publish log shows upload-started, even with no byte counted (R3)', async () => {
    const attemptId = await cancelledAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await appendRunPublicationLine(run.runDir, {
      at: '2026-11-20T10:10:00.000Z',
      attemptId,
      platform: 'youtube',
      mode: 'mock',
      event: 'upload-started',
      sizeBytes: run.finalBytes,
      artifactSha256: run.finalSha256,
      visibility: 'private',
      biometricRefs: [],
      platformVideoId: null,
      reasonId: null,
    });
    await writePublishState(harness.platformRoot, failedState(attemptId, 0));

    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    const attempt = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(attempt.state, 'failed');
    assert.equal(attempt.reasonId, 'token-revoked');
  });

  it('reconciles a cancelled attempt to failed when its claimed state.json counted bytes (R3)', async () => {
    const attemptId = await cancelledAttempt();
    await claimPublishAttempt(harness.platformRoot, attemptId, process.pid);
    await writePublishState(harness.platformRoot, failedState(attemptId, 1));

    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));

    assert.equal((await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } })).state, 'failed');
  });
});

describe('RequestPublish step 9 failure', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-step9', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('marks the row failed / internal-error and throws when request.json cannot be written', async () => {
    // A file where the `publish` folder belongs makes the request write fail.
    await writeFile(join(harness.platformRoot, 'publish'), '');

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      (error: unknown) => error instanceof PublishRequestWriteFailedError && !error.message.includes(harness.root),
    );
    const rows = await harness.prisma.publicationAttempt.findMany();
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.ok(row);
    assert.equal(row.state, 'failed');
    assert.equal(row.reasonId, 'internal-error');
    const failureLines = harness.logs.lines.filter((line) => line.includes('publish.'));
    assert.ok(failureLines.some((line) => line.includes('publish.request-write-failed')));
    for (const line of failureLines) assert.equal(line.includes(harness.root), false, 'no path in a publish log line');
  });
});
