import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { writePublishState } from '@studio/shared/platforms/files';
import { appendRunPublicationLine, newUlid, runDirectory } from '@studio/shared/run-files';
import { mockYoutubeVideoId } from '../platforms/clients/mock/mock-data';
import { SyncPublishAttemptsCommand } from '../platforms/commands/platform.commands';
import { buildPlatformGraph } from '../platforms/platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platforms/platform-harness.harness.test';
import { connectMock, openAllGates, publishBody, requestCommand } from '../platforms/publish-scenario.harness.test';
import { seedFixtureCatalog, seedRun } from '../platforms/run-fixture.harness.test';
import { AttemptUploadEvidence } from './attempt-upload-evidence.reader';
import { InsightsRepository } from './insights.repository';

/*
 * "Published without approval" (SPEC 0007 section 5.10, AC 62): the handler rules keep it at 0 on
 * the real publish path, and the query counts a forged attempt or a pasted publication on a run
 * that was not approved, each once. Attempts that never reached `uploading` sent nothing and do
 * not count.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;

async function rejectedRunId(): Promise<string> {
  const run = await seedRun(harness, { runId: newUlid(START.getTime()), approved: false, outcomeDecision: 'rejected' });
  return run.runId;
}

/** An attempt row written straight to SQLite, as a bug or a hand edit would leave it. */
async function forgeAttempt(options: { runId: string; state: string; reasonId?: string | null; approvalDecidedAt?: Date }): Promise<string> {
  const attemptId = newUlid(START.getTime());
  await harness.prisma.publicationAttempt.create({
    data: {
      id: attemptId,
      runId: options.runId,
      platform: 'youtube',
      connectionId: newUlid(START.getTime()),
      mode: 'mock',
      idempotencyKey: newUlid(START.getTime()),
      state: options.state,
      reasonId: options.reasonId ?? null,
      artifactSha256: 'e'.repeat(64),
      artifactBytes: BigInt(1024),
      visibility: 'private',
      aiDisclosure: true,
      biometricRefsJson: '[]',
      biometricConfirmedAt: START,
      approvalDecidedAt: options.approvalDecidedAt ?? new Date(START.getTime() - 3_600_000),
      requestedBy: 'owner',
      createdBy: 'api',
      correlationId: null,
      requestedAt: START,
      expiresAt: new Date(START.getTime() + 7_200_000),
    },
  });
  return attemptId;
}

/** The watcher's `upload-started` line in the run's `publications.jsonl`, written before the first byte. */
async function recordUploadStarted(runId: string, attemptId: string): Promise<void> {
  await appendRunPublicationLine(runDirectory(harness.dataHome.runs, runId), {
    at: START.toISOString(),
    attemptId,
    platform: 'youtube',
    mode: 'mock',
    event: 'upload-started',
    sizeBytes: 1024,
    artifactSha256: 'e'.repeat(64),
    visibility: 'private',
    biometricRefs: [],
    platformVideoId: null,
    reasonId: null,
  });
}

function count(): Promise<number> {
  return new InsightsRepository(harness.prisma, new AttemptUploadEvidence(harness.dataHome)).unapprovedPublicationCount();
}

describe('unapprovedPublicationCount (AC 62)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-insights-unapproved', start: START });
    await seedFixtureCatalog(harness.prisma);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is 0 after a run published through the real request and sync path', async () => {
    const graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    const run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
    const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
    const { attemptId } = created.attempt;
    await writePublishState(harness.platformRoot, {
      format: 1,
      attemptId,
      state: 'published',
      since: START.toISOString(),
      bytesSent: run.finalBytes,
      bytesTotal: run.finalBytes,
      reasonId: null,
      platformVideoId: mockYoutubeVideoId(attemptId),
      platformMediaId: null,
      publishedAt: START.toISOString(),
      followUntil: null,
    });
    await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));
    assert.equal(await harness.prisma.runPublication.count(), 1);

    assert.equal(await count(), 0);
  });

  it('counts a forged attempt that reached uploading on a rejected run once', async () => {
    await forgeAttempt({ runId: await rejectedRunId(), state: 'uploading' });
    assert.equal(await count(), 1);
  });

  it('counts an attempt whose approval was recorded after the request', async () => {
    const run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await forgeAttempt({ runId: run.runId, state: 'published', approvalDecidedAt: new Date(START.getTime() + 60_000) });
    assert.equal(await count(), 1);
  });

  it('counts a pasted publication on a run that was not approved', async () => {
    const runId = await rejectedRunId();
    await harness.prisma.runPublication.create({
      data: {
        id: newUlid(START.getTime()),
        runId,
        platform: 'youtube',
        platformVideoId: 'AbCdEfGhIjK',
        url: 'https://www.youtube.com/watch?v=AbCdEfGhIjK',
        recordedBy: 'owner',
        recordedAt: START,
        origin: 'manual',
        attemptId: null,
      },
    });
    assert.equal(await count(), 1);
  });

  it('does not count attempts on a rejected run that never sent a byte', async () => {
    await forgeAttempt({ runId: await rejectedRunId(), state: 'queued' });
    await forgeAttempt({ runId: await rejectedRunId(), state: 'cancelled' });
    await forgeAttempt({ runId: await rejectedRunId(), state: 'expired' });
    await forgeAttempt({ runId: await rejectedRunId(), state: 'failed', reasonId: 'run-not-approved' });
    assert.equal(await count(), 0);
  });

  it('leaves out failed attempts whose reason can precede any byte when no upload-started line exists (C8)', async () => {
    for (const reasonId of ['token-revoked', 'internal-error', 'watcher-interrupted']) {
      await forgeAttempt({ runId: await rejectedRunId(), state: 'failed', reasonId });
    }
    assert.equal(await count(), 0);
  });

  it('counts such a failed attempt once its run shows an upload-started line for it (C8)', async () => {
    const runId = await rejectedRunId();
    const sent = await forgeAttempt({ runId, state: 'failed', reasonId: 'token-revoked' });
    await forgeAttempt({ runId: await rejectedRunId(), state: 'failed', reasonId: 'watcher-interrupted' });
    await recordUploadStarted(runId, sent);

    assert.equal(await count(), 1);
  });

  it('counts an attempt only for its own upload-started line, not another attempt of the same run (C8)', async () => {
    const runId = await rejectedRunId();
    const unrelated = newUlid(START.getTime());
    await forgeAttempt({ runId, state: 'failed', reasonId: 'internal-error' });
    await recordUploadStarted(runId, unrelated);

    assert.equal(await count(), 0);
  });

  it('keeps counting a failed attempt whose reason is written only during an upload', async () => {
    await forgeAttempt({ runId: await rejectedRunId(), state: 'failed', reasonId: 'media-rejected' });
    assert.equal(await count(), 1);
  });
});
