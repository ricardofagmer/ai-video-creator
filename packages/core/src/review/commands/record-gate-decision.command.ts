import { Command } from '@nestjs/cqrs';
import { type GateDecision, type GateId, type RunId } from '@studio/shared/run-format';

export interface RecordGateDecisionInput {
  runId: RunId;
  /** Kind `plan` or `recipe-gate`; `decidedBy` and `decidedAt` come from the caller's session and clock. */
  decision: GateDecision;
}

export interface GateDecisionResult {
  runId: RunId;
  gate: GateId;
}

/**
 * Answers the gate a run waits on (SPEC 0002 A6, K2) by appending to approval.json, only while no
 * watcher step is in progress. It never writes run.json: the watcher reads the answer and, for a
 * `rejected` plan, ends the run itself (ADR 0003 rev 3).
 */
export class RecordGateDecisionCommand extends Command<GateDecisionResult> {
  constructor(readonly input: RecordGateDecisionInput) {
    super();
  }
}
