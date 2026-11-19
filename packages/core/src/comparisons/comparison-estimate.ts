import { type ComparisonEstimate } from '@studio/shared/api';
import { type Limits, type ProviderName } from '@studio/shared/run-format';

/**
 * Providers whose live mode can bill (section 5.3: "the Claude or a TTS provider"). When every one
 * of them is mocked a run cannot spend, so its worst case is $0. Capture and render are not here.
 */
export const PAID_PROVIDERS: readonly ProviderName[] = ['claude', 'elevenlabs', 'local-voice'];

/** `expectedPairUsd` reads at most this many reviewed paid runs of the recipe id (display only). */
export const EXPECTED_COST_SAMPLE_RUNS = 5;

export interface ComparisonEstimateFacts {
  /** The resolved `limits` frozen in each arm's run.json. */
  limits: { a: Pick<Limits, 'costPerRunUsd' | 'costPerMonthUsd'>; b: Pick<Limits, 'costPerRunUsd' | 'costPerMonthUsd'> };
  paidProviderLive: boolean;
  /** `CostLedgerService.monthToDateUsd`; null when it could not be computed. */
  monthToDateUsd: number | null;
  /** Costs of the recipe's last reviewed paid runs, newest first; display only. */
  recentReviewedRunCostsUsd: readonly number[];
}

function expectedPairUsd(costs: readonly number[]): number | null {
  const sample = costs.filter((cost) => Number.isFinite(cost) && cost > 0).slice(0, EXPECTED_COST_SAMPLE_RUNS);
  if (sample.length === 0) return null;
  return (2 * sample.reduce((sum, cost) => sum + cost, 0)) / sample.length;
}

/**
 * The D11 figures for both runs (section 5.3 "Cost: estimate and gate", B20). Each arm's worst
 * case is its run ceiling, a true upper bound because the engine stops a run at that ceiling (Q2:
 * each arm keeps its own ceiling). Arms of a `recipe-version` comparison may resolve different
 * limits, so the larger run ceiling and the smaller month ceiling are used: the pair worst case
 * stays an upper bound and the month check stays the stricter one.
 */
export function buildComparisonEstimate(facts: ComparisonEstimateFacts): ComparisonEstimate {
  const costPerRunUsd = Math.max(facts.limits.a.costPerRunUsd, facts.limits.b.costPerRunUsd);
  const costPerMonthUsd = Math.min(facts.limits.a.costPerMonthUsd, facts.limits.b.costPerMonthUsd);
  const runWorstCaseUsd = facts.paidProviderLive ? costPerRunUsd : 0;
  const pairWorstCaseUsd = 2 * runWorstCaseUsd;
  const monthToDateUsd = facts.monthToDateUsd;
  return {
    runWorstCaseUsd,
    pairWorstCaseUsd,
    expectedPairUsd: expectedPairUsd(facts.recentReviewedRunCostsUsd),
    monthToDateUsd,
    costPerRunUsd,
    costPerMonthUsd,
    // Unknown month spend is never within the ceiling (fails closed, as the gate does).
    withinMonthCeiling: monthToDateUsd !== null && !(monthToDateUsd + pairWorstCaseUsd > costPerMonthUsd),
  };
}
