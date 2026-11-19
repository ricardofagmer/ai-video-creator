import { type Prisma } from '@prisma/client';
import { type GateDecision, type RunFile } from '@studio/shared/run-format';
import { type RunEvidence } from './run-evidence';

/** The D14 review form: the `final` variant of the C3 gate decision. */
export type FinalGateDecision = Extract<GateDecision, { kind: 'final' }>;

/** `run_outcomes` columns of one reviewed run (PRD 8 item 1); the run index row must exist first. */
export function toRunOutcomeRow(
  run: RunFile,
  decision: FinalGateDecision,
  evidence: RunEvidence,
): Prisma.RunOutcomeUncheckedCreateInput {
  return {
    runId: run.runId,
    decision: decision.outcome,
    decidedBy: decision.decidedBy,
    decidedAt: new Date(decision.decidedAt),
    rating: decision.rating,
    notes: decision.notes,
    reviewerScoresJson: JSON.stringify(evidence.reviewerScores),
    qaMetricsJson: JSON.stringify(evidence.qaMetrics),
    recoveries: run.totals.recoveries,
    costUsd: evidence.costUsd,
    durationMs: BigInt(run.totals.durationMs),
  };
}
