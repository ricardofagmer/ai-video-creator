import { curationBounds } from '@studio/shared/curation';
import { defaultLimits } from '@studio/shared/run-format';

/**
 * Month ceiling of every curation (SPEC 0005 B9, owner answer Q4): the default `costPerMonthUsd`
 * ($60), whatever the subject; a prompt or skill subject has no recipe limits of its own.
 */
export const CURATION_MONTH_CEILING_USD = defaultLimits.costPerMonthUsd;

export interface CurationMonthGateFacts {
  /** `CostLedgerService.monthToDateUsd`, or null when it could not be computed. */
  monthToDateUsd: number | null;
  /** What this curation may still spend: $1.00 at the request, $1.00 minus the spend in the watcher. */
  reserveUsd: number;
  costPerMonthUsd: number;
}

export type CurationMonthGateDecision =
  | { decision: 'allow'; monthToDateUsd: number }
  | { decision: 'refuse'; reason: 'month-spend-unavailable' }
  | { decision: 'refuse'; reason: 'over-month-ceiling'; monthToDateUsd: number };

export interface CurationSpendFacts {
  monthToDateUsd: number | null;
  /** The owner's explicit consent from `CreateCurationRequest` (B3, Q2). */
  acceptedWorstCaseUsd: number;
  costPerMonthUsd: number;
}

export type CurationSpendDecision =
  | { decision: 'allow'; monthToDateUsd: number; worstCaseUsd: number }
  | { decision: 'refuse'; reason: 'month-spend-unavailable' | 'curation-estimate-changed' }
  | { decision: 'refuse'; reason: 'curation-over-month-ceiling'; monthToDateUsd: number };

export interface CuratorCallBudgetFacts {
  /** `curation.json` `spentUsd` so far. */
  spentUsd: number;
  /** `CurationCostPort.worstCaseUsd` of the call about to be made. */
  worstCaseUsd: number;
}

export type CuratorCallBudgetDecision = { decision: 'call'; remainingUsd: number } | { decision: 'refuse'; reason: 'over-curation-ceiling' };

function toCents(usd: number): number {
  return Math.round(usd * 100);
}

function isKnownAmount(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/**
 * The month gate shared by the api and the watcher (topology 0004 section 7), pure and fail-closed:
 * there is no branch that allows with an unknown, non-finite or negative month figure. Compared
 * unrounded, so a fraction of a cent over the ceiling refuses. A non-finite reserve or ceiling is
 * treated as unknown too.
 */
export function decideCurationMonthGate(facts: CurationMonthGateFacts): CurationMonthGateDecision {
  const { monthToDateUsd } = facts;
  if (!isKnownAmount(monthToDateUsd) || !isKnownAmount(facts.reserveUsd) || !isKnownAmount(facts.costPerMonthUsd)) {
    return { decision: 'refuse', reason: 'month-spend-unavailable' };
  }
  if (monthToDateUsd + facts.reserveUsd > facts.costPerMonthUsd) {
    return { decision: 'refuse', reason: 'over-month-ceiling', monthToDateUsd };
  }
  return { decision: 'allow', monthToDateUsd };
}

/**
 * `POST /curations` step 4 (SPEC 0005 section 5.1), pure, in the spec's order, the same rule as
 * `decideComparisonStart`: the month figure is checked before the consent and an unknown figure
 * always refuses (503); consent not equal to $1.00 to the cent refuses (409); month-to-date plus
 * $1.00 over the month ceiling refuses (422).
 */
export function decideCurationSpend(facts: CurationSpendFacts): CurationSpendDecision {
  if (!isKnownAmount(facts.monthToDateUsd)) return { decision: 'refuse', reason: 'month-spend-unavailable' };
  const worstCaseUsd = curationBounds.maxUsd;
  if (!Number.isFinite(facts.acceptedWorstCaseUsd) || toCents(facts.acceptedWorstCaseUsd) !== toCents(worstCaseUsd)) {
    return { decision: 'refuse', reason: 'curation-estimate-changed' };
  }
  const gate = decideCurationMonthGate({
    monthToDateUsd: facts.monthToDateUsd,
    reserveUsd: worstCaseUsd,
    costPerMonthUsd: facts.costPerMonthUsd,
  });
  if (gate.decision === 'refuse') {
    return gate.reason === 'over-month-ceiling'
      ? { decision: 'refuse', reason: 'curation-over-month-ceiling', monthToDateUsd: gate.monthToDateUsd }
      : { decision: 'refuse', reason: 'month-spend-unavailable' };
  }
  return { decision: 'allow', monthToDateUsd: gate.monthToDateUsd, worstCaseUsd };
}

/**
 * The $1.00 per-curation bound before each Curator call (topology 0004 section 7, C5-AC-08): the
 * call is made only when the spend so far plus its worst case stays within $1.00. An unknown
 * amount refuses.
 */
export function decideCuratorCallBudget(facts: CuratorCallBudgetFacts): CuratorCallBudgetDecision {
  if (!isKnownAmount(facts.spentUsd) || !isKnownAmount(facts.worstCaseUsd)) return { decision: 'refuse', reason: 'over-curation-ceiling' };
  const remainingUsd = curationBounds.maxUsd - facts.spentUsd;
  // Nothing left means no call, even a free mock one: the packet budget must stay positive.
  if (remainingUsd <= 0 || facts.worstCaseUsd > remainingUsd) return { decision: 'refuse', reason: 'over-curation-ceiling' };
  return { decision: 'call', remainingUsd };
}
