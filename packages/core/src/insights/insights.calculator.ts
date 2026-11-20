import {
  INSIGHTS_LISTED_RUNS,
  INSIGHTS_MAX_RECIPES,
  INSIGHTS_RATING_WINDOW,
  insightsTargets,
  type CatalogShareInsight,
  type CostInsight,
  type InsightsView,
  type RecipeRatingTrend,
  type RecipeReviewTime,
  type ReviewReachInsight,
  type RunCatalogShare,
} from '@studio/shared/api';
import { type RunHistory } from './run-history.reader';

/** A run's catalog facts: how many asset versions its manifest names, and how many predate it. */
export type RunCatalogFacts = { status: 'unreadable' } | { status: 'read'; assetVersions: number; fromCatalog: number };

export interface RunInsightFacts {
  runId: string;
  recipeId: string;
  createdAt: Date;
  costUsd: number;
  history: RunHistory;
  catalog: RunCatalogFacts;
  outcome: { decision: string; rating: number; decidedAt: Date } | null;
}

export interface InsightsFacts {
  computedAt: Date;
  /** Runs that reached review, newest first, already capped. */
  runs: readonly RunInsightFacts[];
  truncated: boolean;
  monthToDateUsd: number | null;
  limits: { runUsd: number; monthUsd: number };
  unapprovedPublications: number;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Recipe ids in the order of their most recent run (runs arrive newest first), capped. */
function recipesByRecency(runs: readonly RunInsightFacts[]): string[] {
  return [...new Set(runs.map((run) => run.recipeId))].slice(0, INSIGHTS_MAX_RECIPES);
}

function reviewReach(runs: readonly RunInsightFacts[]): ReviewReachInsight {
  let reachedReview = 0;
  let withoutRepair = 0;
  for (const run of runs) {
    if (run.history.status !== 'read') continue;
    reachedReview += 1;
    if (!run.history.leftFailed) withoutRepair += 1;
  }
  return {
    reachedReview,
    withoutRepair,
    share: reachedReview === 0 ? null : withoutRepair / reachedReview,
    withoutHistory: runs.length - reachedReview,
  };
}

function reviewTime(runs: readonly RunInsightFacts[]): RecipeReviewTime[] {
  const times: RecipeReviewTime[] = [];
  for (const recipeId of recipesByRecency(runs)) {
    const durations = runs
      .filter((run) => run.recipeId === recipeId)
      .flatMap((run) =>
        run.history.status === 'read' && run.history.reviewAt >= run.createdAt
          ? [{ createdAt: run.createdAt.getTime(), ms: run.history.reviewAt.getTime() - run.createdAt.getTime() }]
          : [],
      )
      .sort((left, right) => left.createdAt - right.createdAt);
    const first = durations[0];
    if (first === undefined) continue;
    const latest = durations.length > 1 ? durations[durations.length - 1] : undefined;
    times.push({
      recipeId,
      runs: durations.length,
      firstRunMs: first.ms,
      latestRunMs: latest?.ms ?? null,
      faster: latest === undefined ? null : latest.ms < first.ms,
    });
  }
  return times;
}

function catalogShare(runs: readonly RunInsightFacts[]): CatalogShareInsight {
  const oldestFirst = [...runs].reverse();
  const shares: RunCatalogShare[] = [];
  oldestFirst.forEach((run, index) => {
    if (run.catalog.status !== 'read') return;
    const { assetVersions, fromCatalog } = run.catalog;
    shares.push({ runId: run.runId, ordinal: index + 1, assetVersions, fromCatalog, share: assetVersions === 0 ? null : fromCatalog / assetVersions });
  });
  const fromTarget = shares.filter((entry) => entry.ordinal >= insightsTargets.catalogShareFromRun && entry.share !== null);
  return {
    latestRuns: shares.slice(-INSIGHTS_LISTED_RUNS).reverse(),
    fromTargetRun: fromTarget.length,
    meetingTarget: fromTarget.filter((entry) => (entry.share ?? 0) >= insightsTargets.catalogShare).length,
    withoutManifest: runs.length - shares.length,
  };
}

function cost(facts: InsightsFacts): CostInsight {
  const approved = facts.runs.filter((run) => run.outcome?.decision === 'approved');
  const approvedCostUsd = approved.reduce((sum, run) => sum + run.costUsd, 0);
  return {
    approvedRuns: approved.length,
    approvedCostUsd,
    costPerApprovedUsd: approved.length === 0 ? null : approvedCostUsd / approved.length,
    runsOverRunLimit: facts.runs.filter((run) => run.costUsd > facts.limits.runUsd).length,
    runLimitUsd: facts.limits.runUsd,
    monthToDateUsd: facts.monthToDateUsd,
    monthLimitUsd: facts.limits.monthUsd,
  };
}

function ratingTrend(runs: readonly RunInsightFacts[]): RecipeRatingTrend[] {
  const trends: RecipeRatingTrend[] = [];
  for (const recipeId of recipesByRecency(runs)) {
    const ratings = runs
      .flatMap((run) => (run.recipeId === recipeId && run.outcome !== null ? [run.outcome] : []))
      .sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime())
      .map((outcome) => outcome.rating);
    const latest = ratings.slice(0, INSIGHTS_RATING_WINDOW);
    const previous = ratings.slice(INSIGHTS_RATING_WINDOW, INSIGHTS_RATING_WINDOW * 2);
    if (latest.length === 0) continue;
    const latestMean = mean(latest);
    const previousMean = previous.length === 0 ? null : mean(previous);
    const bothFull = latest.length === INSIGHTS_RATING_WINDOW && previous.length === INSIGHTS_RATING_WINDOW;
    trends.push({
      recipeId,
      latestMean,
      latestCount: latest.length,
      previousMean,
      previousCount: previous.length,
      holding: bothFull && previousMean !== null ? latestMean >= previousMean : null,
    });
  }
  return trends;
}

/** PRD 0001 section 14 from the facts the handler gathered. Pure; the same facts give the same view. */
export function calculateInsights(facts: InsightsFacts): InsightsView {
  return {
    computedAt: facts.computedAt.toISOString(),
    runsRead: facts.runs.length,
    truncated: facts.truncated,
    reviewReach: reviewReach(facts.runs),
    reviewTime: reviewTime(facts.runs),
    catalogShare: catalogShare(facts.runs),
    cost: cost(facts),
    ratingTrend: ratingTrend(facts.runs),
    unapprovedPublications: facts.unapprovedPublications,
  };
}
