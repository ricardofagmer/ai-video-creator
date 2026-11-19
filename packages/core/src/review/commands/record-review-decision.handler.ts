import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { writeRunFile } from '@studio/shared/run-files';
import {
  GateDecisionSchema,
  RunIdSchema,
  latestDecision,
  uncheckedRequiredItems,
  type RunFile,
  type RunState,
} from '@studio/shared/run-format';
import { RunOutcomeRecorder, type FinalGateDecision } from '../../outcomes';
import { QualityScoreService } from '../../quality';
import { appendDecision, readApproval } from '../approval-ledger';
import { parseReviewInput } from '../review-input';
import { ReviewRunAccess, type LoadedRun } from '../review-run-access';
import { InvalidReviewInputError, RequiredChecklistUncheckedError, ReviewNotAllowedError } from '../review.errors';
import { RunLocks } from '../run-locks';
import { RecordReviewDecisionCommand, type ReviewDecisionResult } from './record-review-decision.command';

function parseFinalDecision(input: unknown): FinalGateDecision {
  const decision = parseReviewInput(GateDecisionSchema, input, 'decision');
  if (decision.kind !== 'final') {
    throw new InvalidReviewInputError([{ path: 'decision.kind', message: 'the review decision is kind final' }]);
  }
  return decision;
}

/** Answers that name items the recipe checklist lacks, or the same item twice, are refused. */
function assertKnownChecklistItems(run: RunFile, decision: FinalGateDecision): void {
  const known = new Set(run.recipe.definition.checklist.map((item) => item.id));
  const seen = new Set<string>();
  for (const answer of decision.checklist) {
    if (!known.has(answer.itemId) || seen.has(answer.itemId)) {
      throw new InvalidReviewInputError([{ path: 'decision.checklist', message: `unknown or repeated item ${answer.itemId}` }]);
    }
    seen.add(answer.itemId);
  }
}

function decidedState(decision: FinalGateDecision, since: string): RunState {
  return decision.outcome === 'approved'
    ? { status: 'approved', since, decidedBy: decision.decidedBy }
    : { status: 'rejected', since, decidedBy: decision.decidedBy, gate: 'final' };
}

function isSameDecision(left: FinalGateDecision, right: FinalGateDecision): boolean {
  return left.outcome === right.outcome && left.decidedBy === right.decidedBy && left.decidedAt === right.decidedAt;
}

@CommandHandler(RecordReviewDecisionCommand)
export class RecordReviewDecisionHandler implements ICommandHandler<RecordReviewDecisionCommand, ReviewDecisionResult> {
  private readonly logger = new Logger(RecordReviewDecisionHandler.name);

  constructor(
    private readonly runs: ReviewRunAccess,
    private readonly locks: RunLocks,
    private readonly outcomes: RunOutcomeRecorder,
    private readonly quality: QualityScoreService,
  ) {}

  async execute(command: RecordReviewDecisionCommand): Promise<ReviewDecisionResult> {
    const runId = parseReviewInput(RunIdSchema, command.input.runId, 'runId');
    const decision = parseFinalDecision(command.input.decision);
    const result = await this.decide(runId, decision);
    // After the outcome transaction committed, outside the run lock (SPEC 0003 section 5.1, B4). A
    // failed rescore is logged by the service and never fails the review.
    await this.quality.recomputeAfterReview({ runId, correlationId: decision.correlationId });
    return result;
  }

  private async decide(runId: string, decision: FinalGateDecision): Promise<ReviewDecisionResult> {
    return this.locks.withRun(runId, async () => {
      const loaded = await this.runs.load(runId);
      await this.runs.assertNoLiveWatcher(loaded);
      const state = loaded.run.state;
      // A run the watcher rejected at the plan or a recipe gate never reached the final review.
      if (state.status === 'approved' || (state.status === 'rejected' && state.gate === 'final')) {
        return this.replay(loaded, decision);
      }
      if (state.status !== 'review') throw new ReviewNotAllowedError(runId, state.status, 'status');

      assertKnownChecklistItems(loaded.run, decision);
      const unchecked = uncheckedRequiredItems(loaded.run.recipe.definition.checklist, decision);
      if (unchecked.length > 0) throw new RequiredChecklistUncheckedError(runId, unchecked);

      // Order: approval.json, then run.json, then SQLite. A crash after run.json leaves the files
      // decided (files win) and `replay` completes SQLite on the next call.
      await appendDecision(loaded, decision);
      const since = new Date().toISOString();
      const decided: RunFile = { ...loaded.run, updatedAt: since, state: decidedState(decision, since) };
      await writeRunFile(loaded.runDir, decided);
      this.logger.log({ event: 'review.decided', runId, status: decision.outcome, correlationId: decision.correlationId });
      await this.outcomes.record({ runDir: loaded.runDir, run: decided, decision });
      return { runId, status: decision.outcome };
    });
  }

  /**
   * The run is already decided. The decision in force in approval.json is written to SQLite again
   * (idempotent), which repairs a crash between run.json and SQLite. A retry of that same decision
   * succeeds; any other decision is refused, because a reviewed run is never decided twice.
   */
  private async replay(loaded: LoadedRun, decision: FinalGateDecision): Promise<ReviewDecisionResult> {
    const status = loaded.run.state.status;
    const recorded = latestDecision(await readApproval(loaded), 'final');
    if (recorded === undefined || recorded.kind !== 'final' || recorded.outcome !== status) {
      // run.json was decided without a matching final answer: not written by this handler.
      throw new ReviewNotAllowedError(loaded.runId, status, 'already-decided');
    }
    await this.outcomes.record({ runDir: loaded.runDir, run: loaded.run, decision: recorded });
    if (!isSameDecision(recorded, decision)) throw new ReviewNotAllowedError(loaded.runId, status, 'already-decided');
    return { runId: loaded.runId, status: recorded.outcome };
  }
}
