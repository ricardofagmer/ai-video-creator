import { resolveLimits, type RunStatus } from '@studio/shared/run-format';
import { scheduleBounds, type ScheduleBrief, type ScheduleFile, type SlotSkippedReason } from '@studio/shared/schedules';
import { RUNNABLE_RECIPE_STATUSES } from '../recipes/recipe-policy';
import { type RecipeVersionView } from '../recipes/recipe-version.mapper';

/*
 * The guard chain of SPEC 0006 section 5.6 as one pure function. The watcher (R3-04) collects the
 * facts, calls `decideSlot` for the one candidate slot, and either appends `skipped` with the
 * reason or builds the run with `ScheduledRunFactory`.
 */

/** Statuses in which the schedule's last fired run still holds the schedule (`previous-run-open`). */
export const OPEN_RUN_STATUSES: readonly RunStatus[] = ['pending', 'running', 'waiting', 'paused', 'interrupted'];

/** The skipped reasons the guard chain itself can answer, in its order. */
export type SlotGuardReason = Extract<
  SlotSkippedReason,
  | 'previous-run-open'
  | 'review-backlog'
  | 'brief-queue-empty'
  | 'month-spend-unavailable'
  | 'over-month-ceiling'
  | 'recipe-not-runnable'
  | 'bindings-unresolvable'
>;

/** The schedule's last fired run. `unreadable` cannot be proven closed, so it holds the schedule. */
export type LastFiredRun = { state: 'none' } | { state: 'read'; status: RunStatus } | { state: 'unreadable' };

/**
 * The pinned recipe at the slot instant. `refsResolvable` covers the recipe bindings and the
 * selected brief's references (`bindings-unresolvable`).
 */
export type SlotRecipeState = { state: 'missing' } | { state: 'found'; version: RecipeVersionView; refsResolvable: boolean };

export interface SlotGuardFacts {
  lastFiredRun: LastFiredRun;
  /** The schedule's fired runs whose status is `review`. */
  runsAtReview: number;
  /** `selectBrief`'s answer: null when the queue has no unused brief. */
  brief: ScheduleBrief | null;
  /** Month-to-date spend, or null when it could not be computed (never zero for unknown). */
  monthToDateUsd: number | null;
  recipe: SlotRecipeState;
}

/**
 * `fire` carries a known month figure by construction: no path reaches it with an unknown one
 * (K11, R3-AC-17).
 */
export type SlotDecision =
  | { decision: 'fire'; brief: ScheduleBrief; recipe: RecipeVersionView; monthToDateUsd: number; costPerMonthUsd: number }
  | { decision: 'skip'; reasonId: SlotGuardReason };

function isKnownAmount(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/**
 * Queue mode (Q5): the first brief, in file order, that no `fired` line used; null when every brief
 * was used. Repeat mode stays readable in the file contract: it always uses the first brief.
 */
export function selectBrief(schedule: Pick<ScheduleFile, 'briefMode' | 'briefs'>, usedBriefIds: ReadonlySet<string>): ScheduleBrief | null {
  if (schedule.briefMode === 'repeat') return schedule.briefs[0] ?? null;
  return schedule.briefs.find((brief) => !usedBriefIds.has(brief.briefId)) ?? null;
}

/**
 * Section 5.6 guards in order; the first hit skips. Fail closed: an unknown, negative or non-finite
 * month figure is `month-spend-unavailable`, and a missing recipe (no ceiling to compare with) is
 * `recipe-not-runnable`. The month check is "at or over" the pinned recipe's resolved
 * `costPerMonthUsd` (B9); the cost month is the Mac's local month (L9).
 */
export function decideSlot(facts: SlotGuardFacts): SlotDecision {
  const { lastFiredRun } = facts;
  if (lastFiredRun.state === 'unreadable' || (lastFiredRun.state === 'read' && OPEN_RUN_STATUSES.includes(lastFiredRun.status))) {
    return { decision: 'skip', reasonId: 'previous-run-open' };
  }
  if (facts.runsAtReview >= scheduleBounds.maxOpenReviews) return { decision: 'skip', reasonId: 'review-backlog' };
  if (facts.brief === null) return { decision: 'skip', reasonId: 'brief-queue-empty' };

  const { monthToDateUsd } = facts;
  if (!isKnownAmount(monthToDateUsd)) return { decision: 'skip', reasonId: 'month-spend-unavailable' };
  if (facts.recipe.state === 'missing') return { decision: 'skip', reasonId: 'recipe-not-runnable' };

  const { version, refsResolvable } = facts.recipe;
  const { costPerMonthUsd } = resolveLimits(version.recipe.limits);
  if (!isKnownAmount(costPerMonthUsd)) return { decision: 'skip', reasonId: 'month-spend-unavailable' };
  if (monthToDateUsd >= costPerMonthUsd) return { decision: 'skip', reasonId: 'over-month-ceiling' };
  if (!RUNNABLE_RECIPE_STATUSES.includes(version.recipe.status)) return { decision: 'skip', reasonId: 'recipe-not-runnable' };
  if (!refsResolvable) return { decision: 'skip', reasonId: 'bindings-unresolvable' };
  return { decision: 'fire', brief: facts.brief, recipe: version, monthToDateUsd, costPerMonthUsd };
}
