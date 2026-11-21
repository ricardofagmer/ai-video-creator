import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type PublishRequest } from '@studio/shared/api';
import { claimPublishAttempt, hasCancelMarker, readPublishRequest } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, readAllFiles, type PlatformHarness } from '../platform-harness.harness.test';
import { PlatformRefusedError, PublishAttemptNotFoundError } from '../platforms.errors';
import { connectMock, openAllGates, publishBody, publishFolders, requestCommand } from '../publish-scenario.harness.test';
import { BIOMETRIC_REF, seedFixtureCatalog, seedRun, type SeededRun } from '../run-fixture.harness.test';
import { CancelPublishCommand, SyncPublishAttemptsCommand } from './platform.commands';

/*
 * RequestPublish success, idempotency, cancel and expiry (SPEC 0007 section 5.4, K4, K5). A
 * throwaway SQLite under os.tmpdir(), mock clients, the in-memory vault.
 */

const START = new Date('2026-11-20T10:00:00.000Z');
const TWO_HOURS_MS = 2 * 3_600_000;
const OWNER_TEXT: readonly string[] = ['Titulo de teste do tour', 'Legenda de teste do tour', 'tour_teste'];

let harness: PlatformHarness;
let graph: PlatformGraph;
let run: SeededRun;

/** Finding C9: a reused key whose body differs is a 409 conflict, never malformed input. */
function keyReused(error: unknown): boolean {
  return error instanceof PlatformRefusedError && error.reason === 'publish-idempotency-key-reused' && error.category === 'conflict';
}

describe('RequestPublish lifecycle', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-lifecycle', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  describe('a valid request', () => {
    it('creates one queued attempt row and request.json holding the owner metadata, expiring after 2 hours', async () => {
      const body = publishBody(run);

      const result = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));

      assert.equal(result.outcome, 'created');
      assert.equal(result.attempt.state, 'queued');
      assert.equal(result.attempt.mode, 'mock');
      assert.equal(Date.parse(result.attempt.expiresAt) - Date.parse(result.attempt.requestedAt), TWO_HOURS_MS);
      const row = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: result.attempt.attemptId } });
      assert.equal(row.state, 'queued');
      assert.equal(row.visibility, 'private');
      assert.equal(row.artifactSha256, run.finalSha256);
      const storedRefs: unknown = JSON.parse(row.biometricRefsJson);
      assert.deepEqual(storedRefs, [BIOMETRIC_REF]);
      const request = await readPublishRequest(harness.platformRoot, result.attempt.attemptId);
      assert.equal(request.status, 'present');
      if (request.status !== 'present') return;
      assert.deepEqual(request.value.metadata, body.metadata);
      assert.deepEqual(request.value.biometric.refs, [BIOMETRIC_REF]);
      assert.equal(request.value.artifact.sha256, run.finalSha256);
    });

    it('keeps the title, caption and tags out of SQLite, every other file and the logs', async () => {
      await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));

      for (const file of await readAllFiles(harness.root)) {
        if (file.path.endsWith('request.json')) continue;
        for (const owned of OWNER_TEXT) assert.equal(file.text.includes(owned), false, `${owned} in ${file.path}`);
      }
      const logs = harness.logs.text();
      assert.match(logs, /publish\.requested/);
      for (const owned of OWNER_TEXT) assert.equal(logs.includes(owned), false, owned);
    });
  });

  describe('idempotency (K4)', () => {
    it('answers existing with the same attempt for a repeated key, writing no second row or folder', async () => {
      const body = publishBody(run);
      const first = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));

      const second = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));

      assert.equal(second.outcome, 'existing');
      assert.equal(second.attempt.attemptId, first.attempt.attemptId);
      assert.equal(await harness.prisma.publicationAttempt.count(), 1);
      assert.deepEqual(await publishFolders(harness), [first.attempt.attemptId]);
    });

    it('refuses a key reused for another platform or another run with 409 publish-idempotency-key-reused (C9)', async () => {
      const body = publishBody(run);
      const first = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));
      const otherRun = await seedRun(harness, { runId: newUlid(START.getTime()) });

      await assert.rejects(graph.requestPublish.execute(requestCommand({ run, platform: 'tiktok', body })), keyReused);
      await assert.rejects(
        graph.requestPublish.execute(requestCommand({ run: otherRun, platform: 'youtube', body: { ...body, artifactSha256: otherRun.finalSha256 } })),
        keyReused,
      );
      assert.equal(await harness.prisma.publicationAttempt.count(), 1);
      assert.deepEqual(await publishFolders(harness), [first.attempt.attemptId]);
    });

    it('refuses a reused key whose title, caption, tags, visibility or AI disclosure changed, writing nothing (C9)', async () => {
      const body = publishBody(run);
      const first = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));
      const changedBodies: PublishRequest[] = [
        { ...body, metadata: { ...body.metadata, title: 'Outro titulo de teste' } },
        { ...body, metadata: { ...body.metadata, caption: 'Outra legenda de teste' } },
        { ...body, metadata: { ...body.metadata, tags: ['outra_tag'] } },
        { ...body, metadata: { ...body.metadata, visibility: 'unlisted' } },
        { ...body, metadata: { ...body.metadata, aiDisclosure: false } },
      ];

      for (const changed of changedBodies) {
        await assert.rejects(graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: changed })), keyReused);
      }

      assert.equal(await harness.prisma.publicationAttempt.count(), 1);
      assert.deepEqual(await publishFolders(harness), [first.attempt.attemptId]);
      const stored = await readPublishRequest(harness.platformRoot, first.attempt.attemptId);
      assert.deepEqual(stored.status === 'present' ? stored.value.metadata : null, body.metadata, 'request.json keeps the first body');
      assert.match(harness.logs.text(), /publish-idempotency-key-reused/);
    });

    it('still answers the same attempt for the unchanged body after a refused change (C9)', async () => {
      const body = publishBody(run);
      const first = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));
      await assert.rejects(
        graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: { ...body, metadata: { ...body.metadata, title: 'Mudou' } } })),
        keyReused,
      );

      const again = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));

      assert.equal(again.outcome, 'existing');
      assert.equal(again.attempt.attemptId, first.attempt.attemptId);
    });

    it('refuses a new key while an attempt for the same run and platform is open', async () => {
      await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));

      await assert.rejects(
        graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
        (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-already-in-progress',
      );
      assert.equal(await harness.prisma.publicationAttempt.count(), 1);
      assert.equal((await publishFolders(harness)).length, 1);
    });
  });

  describe('cancel (K5)', () => {
    it('cancels a queued attempt with a marker, and a repeated cancel answers the same cancelled view', async () => {
      const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
      const { attemptId } = created.attempt;
      const command = new CancelPublishCommand({ runId: run.runId, attemptId, correlationId: null });

      const cancelled = await graph.cancelPublish.execute(command);
      const repeated = await graph.cancelPublish.execute(command);

      assert.equal(cancelled.state, 'cancelled');
      assert.equal(repeated.state, 'cancelled');
      assert.equal(await hasCancelMarker(harness.platformRoot, attemptId), true);
      assert.equal((await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } })).state, 'cancelled');
    });

    it('refuses to cancel an attempt the watcher already claimed and writes no marker', async () => {
      const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
      const { attemptId } = created.attempt;
      assert.equal(await claimPublishAttempt(harness.platformRoot, attemptId, process.pid), 'claimed');

      await assert.rejects(
        graph.cancelPublish.execute(new CancelPublishCommand({ runId: run.runId, attemptId, correlationId: null })),
        (error: unknown) => error instanceof PlatformRefusedError && error.reason === 'publish-attempt-not-cancellable',
      );
      assert.equal(await hasCancelMarker(harness.platformRoot, attemptId), false);
      assert.equal((await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } })).state, 'queued');
    });

    it('answers publish-attempt-not-found for an attempt of another run', async () => {
      const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
      const otherRunId = newUlid(START.getTime());

      await assert.rejects(
        graph.cancelPublish.execute(new CancelPublishCommand({ runId: otherRunId, attemptId: created.attempt.attemptId, correlationId: null })),
        PublishAttemptNotFoundError,
      );
    });
  });

  describe('expiry', () => {
    it('leaves an unclaimed attempt queued up to exactly 2 hours, then expires it on the next sync', async () => {
      const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
      const { attemptId } = created.attempt;

      harness.clock.advance(TWO_HOURS_MS);
      const atDeadline = await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));
      assert.equal(atDeadline.expired, 0);
      assert.equal((await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } })).state, 'queued');

      harness.clock.advance(1);
      const after = await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));
      assert.equal(after.expired, 1);
      assert.equal((await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } })).state, 'expired');
    });
  });
});
