import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  newRunId,
  readApprovalFile,
  readControlRequest,
  readRunFile,
  runDirectory,
  writeApprovalFile,
  writeRunFile,
  writeRunManifest,
} from '@studio/shared/run-files';
import { RunManifestSchema, type RunFile } from '@studio/shared/run-format';
import { type FinalGateDecision } from '../../outcomes';
import { RunOutcomeRecorder } from '../../outcomes/run-outcome.recorder';
import { RunOutcomeRepository } from '../../outcomes/run-outcome.repository';
import { QualityScoreService } from '../../quality';
import { QualityScoreRepository } from '../../quality/quality-score.repository';
import { createCoverageHome, fixtures, type CoverageHome } from '../../test-support';
import {
  InvalidReviewInputError,
  RecordReviewDecisionCommand,
  RequestRunControlCommand,
  RequiredChecklistUncheckedError,
  ReviewNotAllowedError,
  ReviewRunNotFoundError,
} from '..';
import { RecordReviewDecisionHandler } from '../commands/record-review-decision.handler';
import { RequestRunControlHandler } from '../commands/request-run-control.handler';
import { ReviewRunAccess } from '../review-run-access';
import { RunLocks } from '../run-locks';

/*
 * Ticket 07 (review): the real final-review and run-control handlers over the coverage temp home.
 * Run folders are written with the C5 run-file writers as the watcher leaves them at `review`
 * (run.json, approval.json with the plan decision, manifest.json from `package`). No watcher pid
 * file is written, so no watcher is alive.
 */

interface ReviewUnderTest {
  decide: RecordReviewDecisionHandler;
  control: RequestRunControlHandler;
}

function reviewOf(home: CoverageHome): ReviewUnderTest {
  const runs = new ReviewRunAccess(home.dataHome);
  const locks = new RunLocks();
  return {
    decide: new RecordReviewDecisionHandler(
      runs,
      locks,
      new RunOutcomeRecorder(new RunOutcomeRepository(home.prisma)),
      new QualityScoreService(home.prisma, new QualityScoreRepository(home.prisma)),
    ),
    control: new RequestRunControlHandler(runs, locks),
  };
}

/** The fixture's final review form: approved, rating 4, every checklist item checked. */
function approvalDecision(): FinalGateDecision {
  const decision = fixtures.reviewedRun(4).finalDecision;
  assert.ok(decision !== null, 'reviewedRun always carries a final decision');
  return decision;
}

describe('review (ticket 07)', () => {
  let home: CoverageHome;
  let review: ReviewUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-review', start: new Date('2026-11-21T10:00:00.000Z') });
    review = reviewOf(home);
  });

  afterEach(async () => {
    await home.close();
  });

  /** Writes a run folder whose run.json carries `state`, with approval.json and an empty manifest. */
  async function runFolder(state: RunFile['state']): Promise<{ runId: string; runDir: string }> {
    const fixture = fixtures.run();
    const run: RunFile = { ...fixture.run, state };
    const runDir = runDirectory(home.dataHome.runs, run.runId);
    await writeRunFile(runDir, run);
    await writeApprovalFile(runDir, fixture.approval);
    await writeRunManifest(
      runDir,
      RunManifestSchema.parse({
        format: 1,
        runId: run.runId,
        createdAt: run.createdAt,
        recipe: { ref: run.recipe.ref, contentHash: run.recipe.contentHash },
        assets: [],
        references: [],
        parameters: { brief: run.brief, stages: [] },
        models: [],
        outputs: [],
        egress: [],
      }),
    );
    return { runId: run.runId, runDir };
  }

  function inReview(): Promise<{ runId: string; runDir: string }> {
    return runFolder({ status: 'review', since: '2026-11-18T12:30:00.000Z' });
  }

  describe('final review decision', () => {
    it('approves a run in review: approval.json, run.json and the outcome row agree', async () => {
      const { runId, runDir } = await inReview();
      const decision = approvalDecision();

      const result = await review.decide.execute(new RecordReviewDecisionCommand({ runId, decision }));
      const run = await readRunFile(runDir);
      const approval = await readApprovalFile(runDir);
      const outcome = await home.prisma.runOutcome.findUnique({ where: { runId } });

      assert.deepEqual(result, { runId, status: 'approved' });
      assert.equal(run.state.status, 'approved');
      assert.ok(approval.status === 'present');
      assert.deepEqual(approval.value.decisions.at(-1), decision);
      assert.equal(outcome?.decision, 'approved');
      assert.equal(outcome?.rating, 4);
    });

    it('rejects a run in review at the final gate', async () => {
      const { runId, runDir } = await inReview();
      const decision: FinalGateDecision = { ...approvalDecision(), outcome: 'rejected' };

      const result = await review.decide.execute(new RecordReviewDecisionCommand({ runId, decision }));
      const run = await readRunFile(runDir);

      assert.deepEqual(result, { runId, status: 'rejected' });
      assert.ok(run.state.status === 'rejected');
      assert.equal(run.state.gate, 'final');
    });

    it('answers the same result when the same decision is sent again, without a second approval entry', async () => {
      const { runId, runDir } = await inReview();
      const decision = approvalDecision();
      await review.decide.execute(new RecordReviewDecisionCommand({ runId, decision }));

      const replayed = await review.decide.execute(new RecordReviewDecisionCommand({ runId, decision }));
      const approval = await readApprovalFile(runDir);

      assert.deepEqual(replayed, { runId, status: 'approved' });
      assert.ok(approval.status === 'present');
      assert.equal(approval.value.decisions.filter((entry) => entry.kind === 'final').length, 1);
    });
  });

  describe('run control', () => {
    it('writes a pause request for a pending run', async () => {
      const { runId, runDir } = await runFolder({ status: 'pending', since: '2026-11-18T12:00:00.000Z' });

      await review.control.execute(new RequestRunControlCommand({ runId, request: { kind: 'pause' } }));
      const control = await readControlRequest(runDir);

      assert.ok(control.status === 'present');
      assert.equal(control.value.pause, true);
      assert.equal(control.value.stop, false);
    });

    it('keeps an earlier pause when a stop follows it', async () => {
      const { runId, runDir } = await runFolder({ status: 'pending', since: '2026-11-18T12:00:00.000Z' });
      await review.control.execute(new RequestRunControlCommand({ runId, request: { kind: 'pause' } }));

      await review.control.execute(new RequestRunControlCommand({ runId, request: { kind: 'stop' } }));
      const control = await readControlRequest(runDir);

      assert.ok(control.status === 'present');
      assert.equal(control.value.pause, true);
      assert.equal(control.value.stop, true);
    });
  });

  describe('typed errors', () => {
    it('refuses a different decision on an already decided run', async () => {
      const { runId } = await inReview();
      await review.decide.execute(new RecordReviewDecisionCommand({ runId, decision: approvalDecision() }));
      const other: FinalGateDecision = { ...approvalDecision(), outcome: 'rejected', decidedAt: '2026-11-18T14:00:00.000Z' };

      await assert.rejects(review.decide.execute(new RecordReviewDecisionCommand({ runId, decision: other })), (error: unknown) => {
        assert.ok(error instanceof ReviewNotAllowedError);
        assert.equal(error.reason, 'already-decided');
        return true;
      });
    });

    it('refuses a final review of a run that is not in review', async () => {
      const { runId, runDir } = await runFolder({ status: 'pending', since: '2026-11-18T12:00:00.000Z' });

      await assert.rejects(review.decide.execute(new RecordReviewDecisionCommand({ runId, decision: approvalDecision() })), (error: unknown) => {
        assert.ok(error instanceof ReviewNotAllowedError);
        assert.equal(error.reason, 'status');
        return true;
      });
      assert.equal((await readRunFile(runDir)).state.status, 'pending');
    });

    it('refuses an approval with a required checklist item unchecked and leaves the run in review', async () => {
      const { runId, runDir } = await inReview();
      const run = await readRunFile(runDir);
      const required = run.recipe.definition.checklist.filter((item) => item.required).map((item) => item.id);
      const firstRequired = required[0];
      assert.ok(firstRequired !== undefined, 'the fixture recipe has a required checklist item');
      const decision = approvalDecision();
      const unchecked: FinalGateDecision = {
        ...decision,
        checklist: decision.checklist.map((answer) => (answer.itemId === firstRequired ? { ...answer, checked: false } : answer)),
      };

      await assert.rejects(review.decide.execute(new RecordReviewDecisionCommand({ runId, decision: unchecked })), (error: unknown) => {
        assert.ok(error instanceof RequiredChecklistUncheckedError);
        assert.deepEqual(error.itemIds, [firstRequired]);
        return true;
      });
      assert.equal((await readRunFile(runDir)).state.status, 'review');
    });

    it('refuses a checklist answer for an item the recipe does not list', async () => {
      const { runId } = await inReview();
      const decision = approvalDecision();
      const extra: FinalGateDecision = { ...decision, checklist: [...decision.checklist, { itemId: 'coverage-unknown-item', checked: true }] };

      await assert.rejects(review.decide.execute(new RecordReviewDecisionCommand({ runId, decision: extra })), InvalidReviewInputError);
    });

    it('refuses a decision that is not of kind final', async () => {
      const { runId } = await inReview();

      await assert.rejects(
        review.decide.execute(
          new RecordReviewDecisionCommand({
            runId,
            decision: { kind: 'plan', outcome: 'approved', decidedBy: 'owner', decidedAt: '2026-11-18T12:40:00.000Z', notes: '', correlationId: null },
          }),
        ),
        InvalidReviewInputError,
      );
    });

    it('answers ReviewRunNotFoundError for a run without a folder', async () => {
      await assert.rejects(review.decide.execute(new RecordReviewDecisionCommand({ runId: newRunId(), decision: approvalDecision() })), ReviewRunNotFoundError);
    });

    it('refuses a pause for a decided run', async () => {
      const { runId } = await inReview();
      await review.decide.execute(new RecordReviewDecisionCommand({ runId, decision: approvalDecision() }));

      await assert.rejects(review.control.execute(new RequestRunControlCommand({ runId, request: { kind: 'pause' } })), (error: unknown) => {
        assert.ok(error instanceof ReviewNotAllowedError);
        assert.equal(error.reason, 'status');
        return true;
      });
    });
  });
});
