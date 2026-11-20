import { z } from 'zod';
import { IsoDateTimeSchema, RunIdSchema } from '../common/ids';
import { RecipeIdSchema } from '../recipes/recipe';

/*
 * C10 rev 6 `GET /insights` (PRD 0001 R4 goal 4): the section 14 success metrics, read by the web
 * page `/indicadores` and by `studio insights` from one core query. Read-only; nothing here writes.
 *
 * Two definitions the PRD leaves open were set by the owner on 2026-11-19:
 * - A run needed a manual file repair when its `events.jsonl` shows it leaving `failed` before it
 *   reached `review`. Resumes after a pause or a crash (`interrupted`) are not repairs.
 * - An asset version of a run "comes from the catalog" when it was created before the run was.
 */

/** Runs read for the run-history metrics, newest first; older runs are left out and said so. */
export const INSIGHTS_MAX_RUNS = 500;
/** Recipes listed per recipe metric, the ones with the most recent reviewed runs first. */
export const INSIGHTS_MAX_RECIPES = 50;
/** Latest reviewed runs listed with their catalog share. */
export const INSIGHTS_LISTED_RUNS = 10;
/** Size of each window of the rating trend (PRD 14: latest 5 against the previous 5). */
export const INSIGHTS_RATING_WINDOW = 5;

export const insightsTargets = {
  /** Share of runs reaching `review` without a manual file repair. */
  reviewWithoutRepairShare: 0.9,
  /** Share of a run's asset versions that come from the catalog, from the tenth run on. */
  catalogShare: 0.8,
  /** The run from which the catalog share target applies. */
  catalogShareFromRun: 10,
  /** Videos published without a recorded approval. */
  unapprovedPublications: 0,
} as const;

const ShareSchema = z.number().min(0).max(1);
const CountSchema = z.number().int().nonnegative();
const UsdSchema = z.number().nonnegative();
const MillisecondsSchema = z.number().int().nonnegative();

export const ReviewReachInsightSchema = z
  .object({
    /** Runs whose status is `review`, `approved` or `rejected`, with a readable event log. */
    reachedReview: CountSchema,
    withoutRepair: CountSchema,
    /** Null when no run reached review yet. */
    share: ShareSchema.nullable(),
    /** Runs that reached review but have no readable `events.jsonl`; left out of both counts. */
    withoutHistory: CountSchema,
  })
  .strict();
export type ReviewReachInsight = z.infer<typeof ReviewReachInsightSchema>;

export const RecipeReviewTimeSchema = z
  .object({
    recipeId: RecipeIdSchema,
    /** Reviewed runs of this recipe with a known `review` instant. */
    runs: CountSchema,
    /** Run creation (the brief) to the first `review` status, for the recipe's first run. */
    firstRunMs: MillisecondsSchema,
    /** The same for its latest run; null while the recipe has one run only. */
    latestRunMs: MillisecondsSchema.nullable(),
    /** `latestRunMs < firstRunMs`; null while the recipe has one run only. */
    faster: z.boolean().nullable(),
  })
  .strict();
export type RecipeReviewTime = z.infer<typeof RecipeReviewTimeSchema>;

export const RunCatalogShareSchema = z
  .object({
    runId: RunIdSchema,
    /** 1 for the oldest run that reached review, counted over the runs read. */
    ordinal: z.number().int().positive(),
    assetVersions: CountSchema,
    fromCatalog: CountSchema,
    /** Null when the run's manifest names no asset version. */
    share: ShareSchema.nullable(),
  })
  .strict();
export type RunCatalogShare = z.infer<typeof RunCatalogShareSchema>;

export const CatalogShareInsightSchema = z
  .object({
    /** The latest runs with a manifest, newest first. */
    latestRuns: z.array(RunCatalogShareSchema).max(INSIGHTS_LISTED_RUNS),
    /** Runs from `insightsTargets.catalogShareFromRun` on that have a share. */
    fromTargetRun: CountSchema,
    /** Of those, the runs at or above `insightsTargets.catalogShare`. */
    meetingTarget: CountSchema,
    /** Runs that reached review without a readable `manifest.json`. */
    withoutManifest: CountSchema,
  })
  .strict();
export type CatalogShareInsight = z.infer<typeof CatalogShareInsightSchema>;

export const CostInsightSchema = z
  .object({
    approvedRuns: CountSchema,
    approvedCostUsd: UsdSchema,
    /** Null while no run is approved. */
    costPerApprovedUsd: UsdSchema.nullable(),
    /** Runs read whose recorded cost is above `runLimitUsd`. */
    runsOverRunLimit: CountSchema,
    /** D11 default per-run ceiling. */
    runLimitUsd: UsdSchema,
    /** Calendar month to date, the same figure the cost ceiling reads; null when it cannot be read. */
    monthToDateUsd: UsdSchema.nullable(),
    /** D11 default monthly ceiling. */
    monthLimitUsd: UsdSchema,
  })
  .strict();
export type CostInsight = z.infer<typeof CostInsightSchema>;

export const RecipeRatingTrendSchema = z
  .object({
    recipeId: RecipeIdSchema,
    /** Mean rating of the latest decided runs (at most `INSIGHTS_RATING_WINDOW`). */
    latestMean: z.number().min(1).max(5),
    latestCount: z.number().int().min(1).max(INSIGHTS_RATING_WINDOW),
    /** Mean of the window before it; null while there is none. */
    previousMean: z.number().min(1).max(5).nullable(),
    previousCount: z.number().int().min(0).max(INSIGHTS_RATING_WINDOW),
    /** `latestMean >= previousMean` once both windows are full; null before that. */
    holding: z.boolean().nullable(),
  })
  .strict();
export type RecipeRatingTrend = z.infer<typeof RecipeRatingTrendSchema>;

export const InsightsViewSchema = z
  .object({
    computedAt: IsoDateTimeSchema,
    /** Reviewed runs read for the metrics below, at most `INSIGHTS_MAX_RUNS`. */
    runsRead: CountSchema,
    /** True when older reviewed runs were left out. */
    truncated: z.boolean(),
    reviewReach: ReviewReachInsightSchema,
    reviewTime: z.array(RecipeReviewTimeSchema).max(INSIGHTS_MAX_RECIPES),
    catalogShare: CatalogShareInsightSchema,
    cost: CostInsightSchema,
    ratingTrend: z.array(RecipeRatingTrendSchema).max(INSIGHTS_MAX_RECIPES),
    /** Recorded publications whose run has no `approved` outcome. Target 0. */
    unapprovedPublications: CountSchema,
  })
  .strict();
export type InsightsView = z.infer<typeof InsightsViewSchema>;
