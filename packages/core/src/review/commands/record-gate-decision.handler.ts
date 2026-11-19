import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { GateDecisionSchema, RunIdSchema, gateOf, type GateDecision, type GateId, type RunState } from '@studio/shared/run-format';
import { appendDecision } from '../approval-ledger';
import { parseReviewInput } from '../review-input';
import { ReviewRunAccess } from '../review-run-access';
import { InvalidReviewInputError, ReviewNotAllowedError } from '../review.errors';
import { RunLocks } from '../run-locks';
import { RecordGateDecisionCommand, type GateDecisionResult } from './record-gate-decision.command';

type InRunGateDecision = Exclude<GateDecision, { kind: 'final' }>;

function parseInRunDecision(input: unknown): InRunGateDecision {
  const decision = parseReviewInput(GateDecisionSchema, input, 'decision');
  if (decision.kind === 'final') {
    throw new InvalidReviewInputError([{ path: 'decision.kind', message: 'use RecordReviewDecisionCommand for the final review' }]);
  }
  return decision;
}

/** The gate a waiting run is held on: its own gate, or `plan` for planner questions (topology section 12). */
function awaitedGate(state: RunState): GateId | null {
  if (state.status !== 'waiting') return null;
  if (state.cause.kind === 'gate') return state.cause.gate;
  if (state.cause.kind === 'planner-questions') return 'plan';
  return null;
}

@CommandHandler(RecordGateDecisionCommand)
export class RecordGateDecisionHandler implements ICommandHandler<RecordGateDecisionCommand, GateDecisionResult> {
  private readonly logger = new Logger(RecordGateDecisionHandler.name);

  constructor(
    private readonly runs: ReviewRunAccess,
    private readonly locks: RunLocks,
  ) {}

  async execute(command: RecordGateDecisionCommand): Promise<GateDecisionResult> {
    const runId = parseReviewInput(RunIdSchema, command.input.runId, 'runId');
    const decision = parseInRunDecision(command.input.decision);
    const gate = gateOf(decision);
    return this.locks.withRun(runId, async () => {
      const loaded = await this.runs.load(runId);
      // A6/K2: written only while no watcher step is in progress; the watcher ends its execution
      // and removes watcher.pid when it holds a run at a gate.
      await this.runs.assertNoLiveWatcher(loaded);
      const state = loaded.run.state;
      if (awaitedGate(state) !== gate) throw new ReviewNotAllowedError(runId, state.status, 'gate-not-awaited');
      // The daemon resumes a waiting run only on an answer dated at or after the wait began.
      if (Date.parse(decision.decidedAt) < Date.parse(state.since)) {
        throw new InvalidReviewInputError([{ path: 'decision.decidedAt', message: 'earlier than the start of the gate wait' }]);
      }
      await appendDecision(loaded, decision);
      this.logger.log({ event: 'review.gate-answered', runId, gate, outcome: decision.outcome, correlationId: decision.correlationId });
      return { runId, gate };
    });
  }
}
