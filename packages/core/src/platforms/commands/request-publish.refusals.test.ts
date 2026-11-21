import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { writeGatesFile } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platform-harness.harness.test';
import { PlatformRefusedError } from '../platforms.errors';
import { connectMock, openAllGates, publishBody, publishFolders, requestCommand } from '../publish-scenario.harness.test';
import { BIOMETRIC_REF, seedFixtureCatalog, seedRun, type SeededRun } from '../run-fixture.harness.test';

/*
 * RequestPublish refusals (SPEC 0007 section 5.4, AC 45, AC 46, AC 50, OD8): the nine steps run in
 * order and the first failure refuses with nothing written: no `publication_attempts` row and no
 * `publish/<attemptId>/` folder. A throwaway SQLite under os.tmpdir(), mock clients, fake vault.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;
let graph: PlatformGraph;
let run: SeededRun;

async function assertRefusedWithNothingWritten(work: Promise<unknown>, reason: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => error instanceof PlatformRefusedError && error.reason === reason);
  assert.equal(await harness.prisma.publicationAttempt.count(), 0, 'no attempt row');
  assert.deepEqual(await publishFolders(harness), [], 'no request folder');
}

describe('RequestPublish refusals write nothing', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-refusals', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('refuses Instagram with platform-publish-unsupported before any other check (OD8)', async () => {
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'instagram', body: publishBody(run) })),
      'platform-publish-unsupported',
    );
  });

  it('refuses a visibility the platform does not allow at step 1, before the connection check', async () => {
    const body = publishBody(run, { metadata: { ...publishBody(run).metadata, visibility: 'public' } });
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'tiktok', body })),
      'publish-visibility-not-allowed',
    );
  });

  it('refuses a platform that is not connected', async () => {
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'tiktok', body: publishBody(run) })),
      'platform-not-connected',
    );
  });

  it('refuses a closed publish gate with platform-awaiting-review (AC 44)', async () => {
    await writeGatesFile(harness.platformRoot, {
      format: 1,
      gates: {
        youtube: { metrics: 'enabled', publish: 'awaiting-review' },
        instagram: { metrics: 'enabled', publish: 'awaiting-review' },
        tiktok: { metrics: 'enabled', publish: 'enabled' },
      },
      updatedAt: START.toISOString(),
      updatedBy: 'owner',
    });
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      'platform-awaiting-review',
    );
  });

  it('refuses a run without an approved outcome (AC 45)', async () => {
    const unapproved = await seedRun(harness, { runId: newUlid(START.getTime()), approved: false });
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run: unapproved, platform: 'youtube', body: publishBody(unapproved) })),
      'publish-run-not-approved',
    );
  });

  it('refuses a run whose stored outcome is rejected even though its files say approved (AC 45)', async () => {
    const forged = await seedRun(harness, { runId: newUlid(START.getTime()), outcomeDecision: 'rejected' });
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run: forged, platform: 'youtube', body: publishBody(forged) })),
      'publish-run-not-approved',
    );
  });

  it('refuses a hash that differs from the one the dialog showed (AC 50)', async () => {
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run, { artifactSha256: 'f'.repeat(64) }) })),
      'publish-artifact-changed',
    );
  });

  it('refuses a final.mp4 changed on disk after the manifest recorded it (AC 50)', async () => {
    await writeFile(join(run.runDir, 'final.mp4'), 'changed after the review');
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      'publish-artifact-changed',
    );
  });

  it('refuses a missing final.mp4', async () => {
    await rm(join(run.runDir, 'final.mp4'));
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      'publish-artifact-missing',
    );
  });

  it('refuses biometric refs that differ from the set the server derives (AC 46)', async () => {
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run, { biometricRefs: [] }) })),
      'publish-biometric-mismatch',
    );
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(
        requestCommand({ run, platform: 'youtube', body: publishBody(run, { biometricRefs: [BIOMETRIC_REF, 'writer-prompt@1'] }) }),
      ),
      'publish-biometric-mismatch',
    );
  });

  it('refuses a second publication of a run already published by the studio (step 7)', async () => {
    await harness.prisma.runPublication.create({
      data: {
        id: newUlid(START.getTime()),
        runId: run.runId,
        platform: 'youtube',
        platformVideoId: 'AbCdEfGhIjK',
        url: 'https://www.youtube.com/watch?v=AbCdEfGhIjK',
        recordedBy: 'owner',
        recordedAt: START,
        origin: 'studio',
        attemptId: newUlid(START.getTime()),
      },
    });
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
      'publish-already-published',
    );
  });

  it('reports the earliest failing step: approval (step 4) before the biometric set (step 6)', async () => {
    const unapproved = await seedRun(harness, { runId: newUlid(START.getTime()), approved: false });
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run: unapproved, platform: 'youtube', body: publishBody(unapproved, { biometricRefs: [] }) })),
      'publish-run-not-approved',
    );
  });

  it('reports the connection (step 3) before the artifact (step 5)', async () => {
    await assertRefusedWithNothingWritten(
      graph.requestPublish.execute(requestCommand({ run, platform: 'tiktok', body: publishBody(run, { artifactSha256: 'f'.repeat(64) }) })),
      'platform-not-connected',
    );
  });

  it('logs the refusal reason and never the title, caption or tags', async () => {
    await assert.rejects(graph.requestPublish.execute(requestCommand({ run, platform: 'tiktok', body: publishBody(run) })));
    const logs = harness.logs.text();
    assert.match(logs, /publish\.refused/);
    for (const owned of ['Titulo de teste do tour', 'Legenda de teste do tour', 'tour_teste']) assert.equal(logs.includes(owned), false, owned);
  });
});
