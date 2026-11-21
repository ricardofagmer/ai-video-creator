import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { publishBounds, type PublishState, type PublishStateFile } from '@studio/shared/platforms';
import { claimPublishAttempt, publishFilePath, writePublishState } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { mockYoutubeVideoId } from '../clients/mock/mock-data';
import { buildPlatformGraph, type PlatformGraph } from '../platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../platform-harness.harness.test';
import { PlatformRefusedError } from '../platforms.errors';
import { connectMock, openAllGates, publishBody, requestCommand } from '../publish-scenario.harness.test';
import { seedFixtureCatalog, seedRun, type SeededRun } from '../run-fixture.harness.test';

/*
 * RequestPublish step 7, finding R2 (the C4 deferred case): a new attempt is refused, with nothing
 * written, while a withdrawn (`cancelled` or `expired`) attempt of the same run and platform,
 * changed within `publishBounds.inboxFollowMs`, has a claim and a state.json that shows an upload
 * running or published, or no longer parses. A finished, never-claimed or out-of-window attempt
 * does not block. The cases mirror the watcher's re-check in
 * `apps/watcher/src/platforms/publish.step.recheck.test.ts`; the cancelled-row cases with an
 * uploading, published or failed file stay in `sync-publish-attempts.test.ts`. A throwaway SQLite
 * under os.tmpdir(), mock clients, the in-memory vault.
 */

const START = new Date('2026-11-20T10:00:00.000Z');

let harness: PlatformHarness;
let graph: PlatformGraph;
let run: SeededRun;

async function requestAttempt(): Promise<string> {
  const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
  return created.attempt.attemptId;
}

/** How an earlier attempt of the pair was left: its row and its files (mirrors the watcher's re-check cases). */
interface PriorAttempt {
  rowState: PublishState;
  claimed: boolean;
  /** The `state.json` it shows; `corrupt` writes a file that no longer parses; null writes none. */
  fileState: PublishState | 'corrupt' | null;
  /** How long before the handler's clock its row last changed; one minute unless a case says otherwise. */
  rowChangedAgoMs?: number;
}

const PRIOR_CHANGED_AGO_MS = 60_000;

/** `state.json` showing `state`, valid against its contract (bytes counted once an upload began). */
function priorStateFile(attemptId: string, state: PublishState): PublishStateFile {
  const at = new Date(START.getTime() - PRIOR_CHANGED_AGO_MS);
  const published = state === 'published';
  const sent = state !== 'cancelled' && state !== 'expired' && state !== 'queued';
  return {
    format: 1,
    attemptId,
    state,
    since: at.toISOString(),
    bytesSent: sent ? 1 : 0,
    bytesTotal: run.finalBytes,
    reasonId: state === 'failed' ? 'network' : null,
    platformVideoId: published ? mockYoutubeVideoId(attemptId) : null,
    platformMediaId: null,
    publishedAt: published ? at.toISOString() : null,
    // The state.json contract requires a follow window on sent-to-inbox.
    followUntil: state === 'sent-to-inbox' ? new Date(at.getTime() + publishBounds.inboxFollowMs).toISOString() : null,
  };
}

async function writePriorAttempt(prior: PriorAttempt): Promise<string> {
  const attemptId = await requestAttempt();
  const updatedAt = new Date(START.getTime() - (prior.rowChangedAgoMs ?? PRIOR_CHANGED_AGO_MS));
  await harness.prisma.publicationAttempt.update({
    where: { id: attemptId },
    data: { state: prior.rowState, reasonId: prior.rowState === 'failed' ? 'network' : null, updatedAt },
  });
  const row = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  // Guards the window cases: they mean nothing if Prisma replaced the explicit updatedAt.
  assert.equal(row.updatedAt.getTime(), updatedAt.getTime(), 'the row keeps the forged updatedAt');
  if (prior.claimed) assert.equal(await claimPublishAttempt(harness.platformRoot, attemptId, process.pid), 'claimed');
  if (prior.fileState === 'corrupt') await writeFile(publishFilePath(harness.platformRoot, attemptId, 'state'), '{"state":');
  else if (prior.fileState !== null) await writePublishState(harness.platformRoot, priorStateFile(attemptId, prior.fileState));
  return attemptId;
}

describe('RequestPublish step 7 refuses a duplicate while a withdrawn attempt uploads anyway (R2, the watcher re-check cases)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-publish-withdrawn', start: START });
    graph = buildPlatformGraph(harness);
    await openAllGates(harness);
    await seedFixtureCatalog(harness.prisma);
    run = await seedRun(harness, { runId: newUlid(START.getTime()) });
    await connectMock(graph, 'youtube');
  });

  afterEach(async () => {
    await harness.close();
  });

  type Refusal = 'publish-already-in-progress' | 'publish-already-published';
  const duplicates: readonly { name: string; prior: PriorAttempt; reason: Refusal }[] = [
    { name: 'an expired row whose files show processing', prior: { rowState: 'expired', claimed: true, fileState: 'processing' }, reason: 'publish-already-in-progress' },
    {
      name: 'a cancelled row whose files show sent-to-inbox',
      prior: { rowState: 'cancelled', claimed: true, fileState: 'sent-to-inbox' },
      reason: 'publish-already-in-progress',
    },
    { name: 'an expired row whose files show published', prior: { rowState: 'expired', claimed: true, fileState: 'published' }, reason: 'publish-already-published' },
    {
      name: 'a cancelled, claimed row whose state.json no longer parses',
      prior: { rowState: 'cancelled', claimed: true, fileState: 'corrupt' },
      reason: 'publish-already-in-progress',
    },
    {
      name: 'a cancelled row uploading, changed exactly publishBounds.inboxFollowMs ago (the window edge is inside)',
      prior: { rowState: 'cancelled', claimed: true, fileState: 'uploading', rowChangedAgoMs: publishBounds.inboxFollowMs },
      reason: 'publish-already-in-progress',
    },
  ];

  for (const duplicate of duplicates) {
    it(`refuses ${duplicate.reason}, writing nothing, when the pair has ${duplicate.name}`, async () => {
      const priorId = await writePriorAttempt(duplicate.prior);
      const priorRow = await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: priorId } });

      await assert.rejects(
        graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) })),
        (error: unknown) => error instanceof PlatformRefusedError && error.reason === duplicate.reason,
      );

      assert.equal(await harness.prisma.publicationAttempt.count({ where: { runId: run.runId } }), 1, 'no second attempt row');
      assert.deepEqual(await harness.prisma.publicationAttempt.findUniqueOrThrow({ where: { id: priorId } }), priorRow, 'the request reconciles nothing');
      if (duplicate.prior.fileState === 'corrupt') assert.match(harness.logs.text(), /publish\.state-corrupt/);
    });
  }

  const allowed: readonly { name: string; prior: PriorAttempt }[] = [
    { name: 'an expired row whose files show outcome-unknown', prior: { rowState: 'expired', claimed: true, fileState: 'outcome-unknown' } },
    { name: 'a cancelled row whose files show inbox-unconfirmed', prior: { rowState: 'cancelled', claimed: true, fileState: 'inbox-unconfirmed' } },
    { name: 'a cancelled row that was never claimed', prior: { rowState: 'cancelled', claimed: false, fileState: 'cancelled' } },
    { name: 'a claimed cancelled row whose state.json shows cancelled', prior: { rowState: 'cancelled', claimed: true, fileState: 'cancelled' } },
    { name: 'a claimed expired row whose state.json shows expired', prior: { rowState: 'expired', claimed: true, fileState: 'expired' } },
    { name: 'a claimed expired row with no state.json yet', prior: { rowState: 'expired', claimed: true, fileState: null } },
    {
      name: 'a cancelled row uploading anyway but changed publishBounds.inboxFollowMs + 1 ms ago (outside the window)',
      prior: { rowState: 'cancelled', claimed: true, fileState: 'uploading', rowChangedAgoMs: publishBounds.inboxFollowMs + 1 },
    },
    { name: 'a failed row (not withdrawn) whose files show failed', prior: { rowState: 'failed', claimed: true, fileState: 'failed' } },
  ];

  for (const permitted of allowed) {
    it(`creates the new attempt when the pair only has ${permitted.name}`, async () => {
      await writePriorAttempt(permitted.prior);

      const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));

      assert.equal(created.outcome, 'created');
      assert.equal(await harness.prisma.publicationAttempt.count({ where: { runId: run.runId } }), 2);
    });
  }
});
