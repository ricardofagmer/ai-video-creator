import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type PublishRequest } from '@studio/shared/api';
import { publishFilePath, publishMetadataSha256 } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platform-harness.harness.test';
import { PlatformRefusedError } from '../platforms.errors';
import { connectMock, openAllGates, publishBody, publishFolders, requestCommand } from '../publish-scenario.harness.test';
import { seedFixtureCatalog, seedRun, type SeededRun } from '../run-fixture.harness.test';

/*
 * A replayed `idempotencyKey` (SPEC 0007 section 5.4 step 2, findings F-3 and R4): the row stores
 * `publishMetadataSha256` of the body, and a replay compares it, so a changed title, caption or tags
 * is refused even when `request.json` is gone. The connection is not compared. A row written before
 * the hash column, whose `request.json` is missing or corrupt, is "not comparable" (round 3): 409
 * key-reused whatever the row's state, nothing written, answered before step 5 hashes the final
 * video, and nothing from the file escapes the handler. A throwaway SQLite under os.tmpdir(), mock
 * clients, the in-memory vault.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;
let graph: PlatformGraph;
let run: SeededRun;

function keyReused(error: unknown): boolean {
  return error instanceof PlatformRefusedError && error.reason === 'publish-idempotency-key-reused';
}

async function requestWith(body: PublishRequest): Promise<string> {
  const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));
  return created.attempt.attemptId;
}

/** A row as written before `metadata_sha256` existed. */
async function forgetRowHash(attemptId: string): Promise<void> {
  await harness.prisma.publicationAttempt.update({ where: { id: attemptId }, data: { metadataSha256: null } });
}

describe('RequestPublish replay compares the stored body (F-3, R4)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-replay', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stores publishMetadataSha256 of the body in the new row (F-3)', async () => {
    const body = publishBody(run);

    const attemptId = await requestWith(body);

    const row = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(row.metadataSha256, publishMetadataSha256(body.metadata));
  });

  it('refuses a reused key with a changed title through the row hash, with request.json gone (F-3)', async () => {
    const body = publishBody(run);
    const attemptId = await requestWith(body);
    await rm(publishFilePath(harness.platformRoot, attemptId, 'request'));

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: { ...body, metadata: { ...body.metadata, title: 'Outro titulo' } } })),
      keyReused,
    );
    const again = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));
    assert.equal(again.outcome, 'existing');
    assert.equal(again.attempt.attemptId, attemptId);
  });

  it('answers the stored attempt for the same body after a reconnect gave the account a new connection id (R4)', async () => {
    const body = publishBody(run);
    const attemptId = await requestWith(body);
    const row = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const reconnected = await connectMock(graph, 'youtube');
    assert.notEqual(reconnected, row.connectionId);

    const again = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));

    assert.equal(again.outcome, 'existing');
    assert.equal(again.attempt.attemptId, attemptId);
  });

  it('compares an older row through request.json: the same body is the stored attempt, a changed one is 409 (R4)', async () => {
    const body = publishBody(run);
    const attemptId = await requestWith(body);
    await forgetRowHash(attemptId);

    await assert.rejects(
      graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: { ...body, metadata: { ...body.metadata, tags: ['outra_tag'] } } })),
      keyReused,
    );
    const again = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body }));
    assert.equal(again.outcome, 'existing');
  });

  const rowStates = [
    { state: 'queued', reasonId: null },
    { state: 'cancelled', reasonId: null },
    { state: 'failed', reasonId: 'run-not-approved' },
  ] as const;
  for (const damage of ['missing', 'corrupt'] as const) {
    for (const { state, reasonId } of rowStates) {
      it(`refuses a replay on a ${state} older row with a ${damage} request.json as key-reused, writing nothing, before hashing the video (R4)`, async () => {
        const body = publishBody(run);
        const attemptId = await requestWith(body);
        await forgetRowHash(attemptId);
        if (state !== 'queued') {
          await harness.prisma.publicationAttempt.update({ where: { id: attemptId }, data: { state, reasonId } });
        }
        const requestPath = publishFilePath(harness.platformRoot, attemptId, 'request');
        if (damage === 'missing') await rm(requestPath);
        else await writeFile(requestPath, '{ not json');
        // Step 5 would refuse this as publish-artifact-changed; 409 key-reused proves step 2 answered first.
        await writeFile(join(run.runDir, 'final.mp4'), 'changed after the first request');
        const rowBefore = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
        const foldersBefore = await publishFolders(harness);

        await assert.rejects(graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body })), keyReused);

        assert.equal(await harness.prisma.publicationAttempt.count(), 1, 'no second row');
        assert.deepEqual(await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } }), rowBefore, 'the stored row is untouched');
        assert.deepEqual(await publishFolders(harness), foldersBefore, 'no new attempt folder');
        assert.match(harness.logs.text(), /publish\.replay-not-comparable/);
        assert.ok(!harness.logs.text().includes(body.metadata.title), 'no owner text in the logs');
      });
    }
  }
});
