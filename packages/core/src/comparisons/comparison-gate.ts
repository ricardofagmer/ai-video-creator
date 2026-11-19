import { type ComparisonEstimate } from '@studio/shared/api';
import { type RunStatus } from '@studio/shared/run-format';

export interface ArmStartState {
  status: RunStatus;
  /** A live watcher owns the run (ADR 0003); the api may not write it. */
  watcherAlive: boolean;
}

export interface StartGateFacts {
  arms: { a: ArmStartState; b: ArmStartState };
  /** Recomputed for this request; never the estimate the owner saw. */
  estimate: ComparisonEstimate;
  acceptedWorstCaseUsd: number;
}

export type StartRefusal =
  | { decision: 'refuse'; reason: 'comparison-not-startable' | 'month-spend-unavailable' | 'comparison-estimate-changed' }
  | { decision: 'refuse'; reason: 'comparison-over-month-ceiling'; monthToDateUsd: number };

export type StartGateDecision = { decision: 'start'; pairWorstCaseUsd: number; monthToDateUsd: number } | StartRefusal;

function toCents(usd: number): number {
  return Math.round(usd * 100);
}

function isStartable(arm: ArmStartState): boolean {
  return arm.status === 'draft' && !arm.watcherAlive;
}

/**
 * `POST /comparisons/:comparisonId/start` (SPEC 0003 section 5.3, steps 1-4), pure. Checked in the
 * spec's order; the first failing step refuses and nothing is written. The month figure is read
 * before the consent comparison and there is no branch that starts without it: an unknown month
 * spend always refuses (fails closed). A non-finite figure counts as unknown.
 */
export function decideComparisonStart(facts: StartGateFacts): StartGateDecision {
  if (!isStartable(facts.arms.a) || !isStartable(facts.arms.b)) return { decision: 'refuse', reason: 'comparison-not-startable' };

  const { monthToDateUsd, pairWorstCaseUsd, costPerMonthUsd } = facts.estimate;
  if (monthToDateUsd === null || !Number.isFinite(monthToDateUsd) || monthToDateUsd < 0) {
    return { decision: 'refuse', reason: 'month-spend-unavailable' };
  }
  if (!Number.isFinite(facts.acceptedWorstCaseUsd) || toCents(facts.acceptedWorstCaseUsd) !== toCents(pairWorstCaseUsd)) {
    return { decision: 'refuse', reason: 'comparison-estimate-changed' };
  }
  // Compared unrounded: a fraction of a cent over the ceiling still refuses.
  if (monthToDateUsd + pairWorstCaseUsd > costPerMonthUsd) {
    return { decision: 'refuse', reason: 'comparison-over-month-ceiling', monthToDateUsd };
  }

  return { decision: 'start', pairWorstCaseUsd, monthToDateUsd };
}
