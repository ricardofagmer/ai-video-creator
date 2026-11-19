import { Command } from '@nestjs/cqrs';
import { type GateDecision, type RunId } from '@studio/shared/run-format';

export interface RecordReviewDecisionInput {
  runId: RunId;
  /** Kind `final` (D14 form); `decidedBy` and `decidedAt` come from the caller's session and clock. */
  decision: GateDecision;
}

export interface ReviewDecisionResult {
  runId: RunId;
  status: 'approved' | 'rejected';
}

/**
 * The final human review (ADR 0003 "Who writes what"): appends the decision to approval.json and
 * moves run.json from `review` to `approved` / `rejected`, only with no live watcher, then writes
 * the same outcome to SQLite. The only code path that writes `approved` (R1-17).
 */
export class RecordReviewDecisionCommand extends Command<ReviewDecisionResult> {
  constructor(readonly input: RecordReviewDecisionInput) {
    super();
  }
}
