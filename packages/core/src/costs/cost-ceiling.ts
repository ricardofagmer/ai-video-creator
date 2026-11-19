import { type Limits } from '@studio/shared/run-format';

export interface CostCeilingInput {
  /** Resolved C3 limits: `defaultLimits`, then recipe and run overrides (`resolveLimits`). */
  limits: Pick<Limits, 'costPerRunUsd' | 'costPerMonthUsd'>;
  /** `cost.json` total of the run so far. */
  runSpentUsd: number;
  /** Estimate of the work about to start (the stage at `preflight`, the next call mid-stage). */
  estimateUsd: number;
  /** `CostLedgerPort.monthToDateUsd`; it already includes this run's recorded sessions. */
  monthToDateUsd: number;
}

/**
 * Decision for criteria 20 and 28 (D11: $3 per run, $60 per month by default). `over` carries
 * the C3 `WaitingCause` `cost-ceiling` fields, so the engine sets `waiting` without recomputing.
 */
export type CostCeilingDecision =
  | { decision: 'within'; projectedRunUsd: number; projectedMonthUsd: number }
  | { decision: 'over'; ceiling: 'run' | 'month'; projectedUsd: number; estimateUsd: number; limitUsd: number };

export class InvalidCostAmountError extends Error {
  readonly category = 'validation';

  constructor(readonly field: 'runSpentUsd' | 'estimateUsd' | 'monthToDateUsd') {
    super(`Cost amount ${field} must be a finite, non-negative number`);
    this.name = 'InvalidCostAmountError';
  }
}

function assertAmount(value: number, field: InvalidCostAmountError['field']): void {
  if (!Number.isFinite(value) || value < 0) throw new InvalidCostAmountError(field);
}

/**
 * The run ceiling is checked first. A ceiling is crossed when the projection exceeds it, or
 * when the spend already reached it (D11 "reaching either puts the run in waiting"); a $0 spend
 * against a $0 ceiling, as on an all-mock run, is within.
 */
export function checkCostCeilings(input: CostCeilingInput): CostCeilingDecision {
  assertAmount(input.runSpentUsd, 'runSpentUsd');
  assertAmount(input.estimateUsd, 'estimateUsd');
  assertAmount(input.monthToDateUsd, 'monthToDateUsd');
  const { costPerRunUsd, costPerMonthUsd } = input.limits;

  const projectedRunUsd = input.runSpentUsd + input.estimateUsd;
  const runReached = input.runSpentUsd > 0 && input.runSpentUsd >= costPerRunUsd;
  if (projectedRunUsd > costPerRunUsd || runReached) {
    return { decision: 'over', ceiling: 'run', projectedUsd: projectedRunUsd, estimateUsd: input.estimateUsd, limitUsd: costPerRunUsd };
  }

  const projectedMonthUsd = input.monthToDateUsd + input.estimateUsd;
  const monthReached = input.monthToDateUsd > 0 && input.monthToDateUsd >= costPerMonthUsd;
  if (projectedMonthUsd > costPerMonthUsd || monthReached) {
    return {
      decision: 'over',
      ceiling: 'month',
      projectedUsd: projectedMonthUsd,
      estimateUsd: input.estimateUsd,
      limitUsd: costPerMonthUsd,
    };
  }
  return { decision: 'within', projectedRunUsd, projectedMonthUsd };
}
