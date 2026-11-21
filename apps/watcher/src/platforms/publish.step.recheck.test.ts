import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { publishBounds, type PublishFailureReason, type PublishRequestFile, type PublishState, type PublishStateFile } from '@studio/shared/platforms';
import { claimPublishAttempt, createCancelMarker, publishFilePath, writePublishState } from '@studio/shared/platforms/files';
import { newUlid, writeApprovalFile } from '@studio/shared/run-files';
import { DEAD_PID, HOUR_MS, connectAccount, platformVideoIdFor, queuePublishRequest, setGates, type ApprovedRun } from './platform-fixtures.harness.test';
import {
  claimExists,
  createPlatformHarness,
  prepareRun,
  publicationLines,
  stateOf,
  type PlatformHarness,
} from './platform-step.harness.test';
import { type WithdrawnUpload } from './publish-recheck';

/*
 * The watcher's re-check after the claim and before any byte (SPEC 0007 section 5.5, AC 50), and
 * the expiry and cancel marker checked before the claim, right after it and before the first byte
 * (AC 51). Each refusal sends nothing: no upload call, no `publications.jsonl` line.
 */

interface Prepared {
  connectionId: string;
  run: ApprovedRun;
  request: PublishRequestFile;
}

async function prepareRequest(harness: PlatformHarness): Promise<Prepared> {
  const { connectionId, run } = await prepareRun(harness, 'youtube');
  const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
  return { connectionId, run, request };
}

async function assertNothingSent(harness: PlatformHarness, prepared: Prepared): Promise<void> {
  assert.equal(harness.clients.youtube.calls.upload, 0);
  assert.deepEqual(await publicationLines(harness, prepared.run.runId), []);
}

describe('PublishStep re-check: each failure sends nothing and writes failed with its reason (AC 50)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const refusals: readonly { name: string; reason: PublishFailureReason; arrange: (prepared: Prepared) => Promise<void> }[] = [
    {
      name: 'the publish gate was closed after the request',
      reason: 'gate-closed',
      arrange: async () => setGates(harness.platformRoot, { youtube: { metrics: 'enabled', publish: 'awaiting-review' } }, harness.clock.now()),
    },
    {
      name: 'the account was disconnected',
      reason: 'account-not-connected',
      arrange: async (prepared) => {
        await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: prepared.connectionId, at: harness.clock.now(), state: 'disconnected' });
      },
    },
    {
      name: 'the account was reconnected with another connectionId',
      reason: 'account-not-connected',
      arrange: async () => {
        await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: newUlid(harness.clock.now().getTime()), at: harness.clock.now() });
      },
    },
    {
      name: 'the account was connected in the other mode',
      reason: 'mode-mismatch',
      arrange: async (prepared) => {
        await connectAccount(harness.platformRoot, { platform: 'youtube', connectionId: prepared.connectionId, at: harness.clock.now(), mode: 'live' });
      },
    },
    {
      name: 'the final decision was taken again after the request (decidedAt differs)',
      reason: 'run-not-approved',
      arrange: async (prepared) => {
        const decidedAt = harness.clock.now().toISOString();
        await writeApprovalFile(prepared.run.runDir, {
          runId: prepared.run.runId,
          decisions: [{ kind: 'final', outcome: 'approved', decidedBy: 'owner', decidedAt, notes: '', correlationId: null, rating: 4, checklist: [] }],
        });
      },
    },
    {
      name: 'the final decision in force is now rejected',
      reason: 'run-not-approved',
      arrange: async (prepared) => {
        const decidedAt = harness.clock.now().toISOString();
        await writeApprovalFile(prepared.run.runDir, {
          runId: prepared.run.runId,
          decisions: [{ kind: 'final', outcome: 'rejected', decidedBy: 'owner', decidedAt, notes: '', correlationId: null, rating: 2, checklist: [] }],
        });
      },
    },
    {
      name: 'run_outcomes no longer says approved',
      reason: 'run-not-approved',
      arrange: async () => {
        harness.prisma.outcomeDecision = 'rejected';
      },
    },
    {
      name: 'final.mp4 changed with the same size (hash differs)',
      reason: 'artifact-changed',
      arrange: async (prepared) => writeFile(prepared.run.videoPath, Buffer.alloc(prepared.run.sizeBytes, 9)),
    },
    {
      name: 'final.mp4 changed size',
      reason: 'artifact-changed',
      arrange: async (prepared) => writeFile(prepared.run.videoPath, Buffer.alloc(prepared.run.sizeBytes + 1, 7)),
    },
    {
      name: 'final.mp4 is gone',
      reason: 'artifact-missing',
      arrange: async (prepared) => rm(prepared.run.videoPath),
    },
  ];

  for (const refusal of refusals) {
    it(`writes failed / ${refusal.reason} and sends nothing when ${refusal.name}`, async () => {
      const prepared = await prepareRequest(harness);
      await refusal.arrange(prepared);

      assert.equal(await harness.publish.claimNext(), true);

      const state = await stateOf(harness, prepared.request.attemptId);
      assert.equal(state?.state, 'failed');
      assert.equal(state?.reasonId, refusal.reason);
      assert.equal(state?.bytesSent, 0);
      assert.equal(harness.clients.youtube.calls.refresh, 0, 'the re-check runs before the token is touched');
      await assertNothingSent(harness, prepared);
    });
  }
});

describe('PublishStep expiry and cancel: closed without upload at every checkpoint (AC 51)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('expires an unclaimed request past expiresAt without claiming it', async () => {
    const prepared = await prepareRequest(harness);
    harness.clock.advance(2 * HOUR_MS + 1);

    assert.equal(await harness.publish.claimNext(), false);

    assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'expired');
    assert.equal(await claimExists(harness, prepared.request.attemptId), false);
    await assertNothingSent(harness, prepared);
  });

  it('cancels a request with a cancel marker before the claim', async () => {
    const prepared = await prepareRequest(harness);
    assert.equal(await createCancelMarker(harness.platformRoot, prepared.request.attemptId), 'cancelled');

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'cancelled');
    assert.equal(await claimExists(harness, prepared.request.attemptId), false);
    await assertNothingSent(harness, prepared);
  });

  it('honours a cancel that landed right after the claim, before the re-check and the token', async () => {
    const prepared = await prepareRequest(harness);
    // The api checked for a claim just before the watcher created it, then wrote its marker.
    harness.attemptFiles.afterClaim = async () => writeFile(publishFilePath(harness.platformRoot, prepared.request.attemptId, 'cancel'), '');

    assert.equal(await harness.publish.claimNext(), true);

    assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'cancelled');
    assert.equal(await claimExists(harness, prepared.request.attemptId), true);
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    assert.deepEqual(harness.events.ofType('publish.cancelled').map((event) => 'claimed' in event && event.claimed), [true]);
    await assertNothingSent(harness, prepared);
  });

  it('honours an expiry reached right after the claim', async () => {
    const prepared = await prepareRequest(harness);
    harness.attemptFiles.afterClaim = async () => harness.clock.set(Date.parse(prepared.request.expiresAt) + 1);

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'expired');
    assert.equal(harness.clients.youtube.calls.refresh, 0);
    await assertNothingSent(harness, prepared);
  });

  it('honours a cancel that landed while the token was obtained, before the first byte', async () => {
    const prepared = await prepareRequest(harness);
    harness.clients.youtube.onRefresh = async () => writeFile(publishFilePath(harness.platformRoot, prepared.request.attemptId, 'cancel'), '');

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'cancelled');
    assert.equal(harness.clients.youtube.calls.refresh, 1);
    await assertNothingSent(harness, prepared);
  });

  it('honours an expiry reached while the token was obtained, before the first byte', async () => {
    const prepared = await prepareRequest(harness);
    harness.clients.youtube.onRefresh = async () => harness.clock.set(Date.parse(prepared.request.expiresAt) + 1);

    await harness.publish.claimNext();

    assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'expired');
    assert.equal(harness.clients.youtube.calls.refresh, 1);
    await assertNothingSent(harness, prepared);
  });
});

/** How an earlier attempt of the same run and platform was left: its SQLite row and its files. */
interface PriorAttempt {
  rowState: PublishState;
  claimed: boolean;
  /** The `state.json` it shows; `corrupt` writes a file that no longer parses; null writes none. */
  fileState: PublishState | 'corrupt' | null;
  /** How long ago its row last changed; within the window unless a case says otherwise. */
  rowChangedAgoMs?: number;
}

const PRIOR_REQUESTED_BEFORE_MS = 60_000;

async function writePriorAttempt(harness: PlatformHarness, prepared: Prepared, prior: PriorAttempt): Promise<PublishRequestFile> {
  const at = new Date(harness.clock.now().getTime() - PRIOR_REQUESTED_BEFORE_MS);
  const request = await queuePublishRequest(harness.platformRoot, { run: prepared.run, platform: 'youtube', connectionId: prepared.connectionId, at });
  harness.prisma.attemptRowStates.set(request.attemptId, prior.rowState);
  if (prior.rowChangedAgoMs !== undefined) harness.prisma.attemptRowUpdatedAt.set(request.attemptId, new Date(harness.clock.now().getTime() - prior.rowChangedAgoMs));
  if (prior.claimed) assert.equal(await claimPublishAttempt(harness.platformRoot, request.attemptId, DEAD_PID), 'claimed');
  if (prior.fileState === 'corrupt') {
    await writeFile(publishFilePath(harness.platformRoot, request.attemptId, 'state'), '{"state":');
  } else if (prior.fileState !== null) {
    const published = prior.fileState === 'published';
    const sent = prior.fileState !== 'cancelled' && prior.fileState !== 'expired';
    const state: PublishStateFile = {
      format: 1,
      attemptId: request.attemptId,
      state: prior.fileState,
      since: at.toISOString(),
      bytesSent: sent ? 1 : 0,
      bytesTotal: prepared.run.sizeBytes,
      reasonId: prior.fileState === 'failed' ? 'network' : null,
      platformVideoId: published ? platformVideoIdFor('youtube', request.attemptId) : null,
      platformMediaId: null,
      publishedAt: published ? at.toISOString() : null,
      // The state.json contract requires a follow window on sent-to-inbox.
      followUntil: prior.fileState === 'sent-to-inbox' ? new Date(at.getTime() + publishBounds.inboxFollowMs).toISOString() : null,
    };
    await writePublishState(harness.platformRoot, state);
  }
  return request;
}

describe('PublishStep re-check: a withdrawn attempt uploading anyway blocks a duplicate (finding R2, core step 7 rule)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const duplicates: readonly { name: string; prior: PriorAttempt; verdict: WithdrawnUpload }[] = [
    { name: 'a cancelled row whose files show uploading', prior: { rowState: 'cancelled', claimed: true, fileState: 'uploading' }, verdict: 'in-progress' },
    { name: 'an expired row whose files show processing', prior: { rowState: 'expired', claimed: true, fileState: 'processing' }, verdict: 'in-progress' },
    { name: 'a cancelled row whose files show sent-to-inbox', prior: { rowState: 'cancelled', claimed: true, fileState: 'sent-to-inbox' }, verdict: 'in-progress' },
    { name: 'an expired row whose files show published', prior: { rowState: 'expired', claimed: true, fileState: 'published' }, verdict: 'published' },
    { name: 'a cancelled, claimed row whose state.json no longer parses', prior: { rowState: 'cancelled', claimed: true, fileState: 'corrupt' }, verdict: 'state-corrupt' },
  ];

  for (const duplicate of duplicates) {
    it(`writes failed / internal-error and sends nothing when the run has ${duplicate.name}`, async () => {
      const prepared = await prepareRequest(harness);
      const prior = await writePriorAttempt(harness, prepared, duplicate.prior);

      assert.equal(await harness.publish.claimNext(), true);

      const state = await stateOf(harness, prepared.request.attemptId);
      assert.equal(state?.state, 'failed');
      assert.equal(state?.reasonId, 'internal-error');
      assert.equal(state?.bytesSent, 0);
      assert.equal(harness.clients.youtube.calls.upload, 0);
      assert.equal(harness.clients.youtube.calls.refresh, 0, 'refused before the token is touched');
      assert.deepEqual(await publicationLines(harness, prepared.run.runId), []);
      assert.deepEqual(harness.events.ofType('publish.withdrawn-upload-found'), [
        { type: 'publish.withdrawn-upload-found', attemptId: prepared.request.attemptId, withdrawnAttemptId: prior.attemptId, verdict: duplicate.verdict },
      ]);
    });
  }

  const allowed: readonly { name: string; prior: PriorAttempt }[] = [
    { name: 'a cancelled row whose files show failed (a retry after a failed upload)', prior: { rowState: 'cancelled', claimed: true, fileState: 'failed' } },
    { name: 'an expired row whose files show outcome-unknown', prior: { rowState: 'expired', claimed: true, fileState: 'outcome-unknown' } },
    { name: 'a cancelled row whose files show inbox-unconfirmed', prior: { rowState: 'cancelled', claimed: true, fileState: 'inbox-unconfirmed' } },
    { name: 'a cancelled row that was never claimed', prior: { rowState: 'cancelled', claimed: false, fileState: 'cancelled' } },
    { name: 'a claimed expired row with no state.json yet', prior: { rowState: 'expired', claimed: true, fileState: null } },
    {
      name: 'a cancelled row uploading anyway but changed before publishBounds.inboxFollowMs',
      prior: { rowState: 'cancelled', claimed: true, fileState: 'uploading', rowChangedAgoMs: publishBounds.inboxFollowMs + 1 },
    },
    { name: 'a failed row (not withdrawn) whose files show failed', prior: { rowState: 'failed', claimed: true, fileState: 'failed' } },
  ];

  for (const permitted of allowed) {
    it(`uploads when the run only has ${permitted.name}`, async () => {
      const prepared = await prepareRequest(harness);
      await writePriorAttempt(harness, prepared, permitted.prior);

      assert.equal(await harness.publish.claimNext(), true);

      assert.equal(harness.clients.youtube.calls.upload, 1);
      assert.equal((await stateOf(harness, prepared.request.attemptId))?.state, 'published');
      assert.deepEqual(harness.events.ofType('publish.withdrawn-upload-found'), []);
    });
  }
});
