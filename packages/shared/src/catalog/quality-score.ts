export { platformSignal } from '../metrics/platform-signal';

/**
 * `qualityScore` (SPEC 0003 section 5.1, assumptions B1-B3): the owner's 1-5 rating leads, the
 * reviewer, QA and recoveries nudge it, and the result is shrunk toward a prior mean. Pure, with no
 * I/O, so core's writer (`QualityScoreService`) and the web's explanation share one definition.
 * Changing any constant below bumps `QUALITY_SCORE_FORMULA_VERSION`; the api compares it with the
 * `quality.formula-version` settings row at start and rescores when they differ.
 * Version 2 (SPEC 0006 section 5.4) adds one bounded platform term, `W_PLATFORM * p_i`; a run with
 * no platform signal scores exactly as in version 1. `p_i` is computed by `platformSignal`
 * (`@studio/shared/metrics`, re-exported here).
 */
export const QUALITY_SCORE_FORMULA_VERSION = 2;

/**
 * B1, B2 and SPEC 0006 Q3: the weights, the recovery cap and the prior. Without the platform term
 * the largest nudge is +0.30 or -0.40; with it, +0.60 or -0.70 (SPEC 0006 L3).
 */
export const qualityScoreWeights = Object.freeze({
  /** `W_REVIEWER`, applied to `(rev - 3) / 2`. */
  reviewer: 0.2,
  /** `W_QA`, applied to `+1` (passed), `-1` (passed with warnings) or `0` (absent). */
  qa: 0.1,
  /** `W_RECOVERY`, applied to `min(recoveries, recoveryCap) / recoveryCap`. */
  recovery: 0.1,
  recoveryCap: 2,
  /** `W_PLATFORM` (SPEC 0006 Q3), applied to `p_i` in [-1, 1]; 0 when the run has no signal. */
  platform: 0.3,
  /** `m`: the prior counts as this many runs. */
  priorWeight: 3,
  /** A pool is used as the prior only when it holds at least this many reviewed runs. */
  priorMinRuns: 5,
  /** The prior when no pool is large enough. */
  priorNeutral: 3.0,
  scoreMin: 1,
  scoreMax: 5,
});

/** One reviewed run that used the version: one `run_outcomes` row and its evidence. */
export interface QualityScoreRun {
  /** `run_outcomes.rating`, 1..5. */
  rating: number;
  /** Mean `overall` (1..5) over the reviewer subjects with status `recorded`; null when none. */
  reviewerOverall: number | null;
  /** `qa_metrics_json.outcome`, or `absent` when no QA summary was recorded. */
  qaOutcome: 'passed' | 'passed-with-warnings' | 'absent';
  /** `run_outcomes.recoveries`, int >= 0. */
  recoveries: number;
  /**
   * SPEC 0006 section 5.4: `p_i` in [-1, 1] from `platformSignal`, or null when the run has no
   * eligible snapshot on a platform with a baseline.
   */
  platformSignal: number | null;
}

/** One candidate prior pool for a run: the mean adjusted score `s` over the pool and its size. */
export interface QualityPriorPool {
  meanAdjustedScore: number;
  runCount: number;
}

const qaTerm: Readonly<Record<QualityScoreRun['qaOutcome'], number>> = {
  passed: 1,
  'passed-with-warnings': -1,
  absent: 0,
};

/** `W_PLATFORM * p_i`; refuses a signal outside [-1, 1], which `platformSignal` never returns. */
function platformNudge(signal: number): number {
  if (!Number.isFinite(signal) || signal < -1 || signal > 1) {
    throw new RangeError(`platformSignal must be a number in [-1, 1], got ${signal}`);
  }
  return qualityScoreWeights.platform * signal;
}

/**
 * `s_i`: `clamp(r + a, 1, 5)` with
 * `a = W_REVIEWER * (rev - 3) / 2 + W_QA * q - W_RECOVERY * min(rec, 2) / 2 + W_PLATFORM * p`
 * (SPEC 0003 section 5.1, SPEC 0006 section 5.4). Core uses it to build the recipe, kind and global
 * pool means, so the formula is written once.
 */
export function adjustedRunScore(run: QualityScoreRun): number {
  const weights = qualityScoreWeights;
  const reviewerNudge = run.reviewerOverall === null ? 0 : (weights.reviewer * (run.reviewerOverall - 3)) / 2;
  const qaNudge = weights.qa * qaTerm[run.qaOutcome];
  const recoveryNudge = (weights.recovery * Math.min(run.recoveries, weights.recoveryCap)) / weights.recoveryCap;
  const versionOneAdjusted = run.rating + reviewerNudge + qaNudge - recoveryNudge;
  // No platform term at all (not `+ 0`) when the signal is absent, so version 2 equals version 1 exactly.
  const adjusted = run.platformSignal === null ? versionOneAdjusted : versionOneAdjusted + platformNudge(run.platformSignal);
  return Math.min(weights.scoreMax, Math.max(weights.scoreMin, adjusted));
}

/** `qualityPlatformSampleSize` (SPEC 0006 section 5.4): the reviewed runs with a present `p_i`. */
export function qualityPlatformSampleSize(runs: readonly QualityScoreRun[]): number {
  return runs.filter((run) => run.platformSignal !== null).length;
}

/** `mu(i)`: the first pool, in the caller's order (recipe id, asset kind, all runs), with enough runs. */
function priorMean(pools: readonly QualityPriorPool[]): number {
  const usable = pools.find((pool) => pool.runCount >= qualityScoreWeights.priorMinRuns);
  return usable === undefined ? qualityScoreWeights.priorNeutral : usable.meanAdjustedScore;
}

/**
 * The version's score: `null` when it has no reviewed run, otherwise
 * `(m * mu_v + sum(s_i)) / (m + n)`, unrounded, where `mu_v` is the mean of the per-run priors.
 * `priors[i]` lists the candidate pools of `runs[i]` in order: the run's recipe id, the version's
 * asset kind, then all reviewed runs (B3; pools include the version's own runs). The sample size
 * `n` is `runs.length`.
 */
export function computeQualityScore(
  runs: readonly QualityScoreRun[],
  priors: readonly (readonly QualityPriorPool[])[],
): number | null {
  if (priors.length !== runs.length) {
    throw new RangeError(`computeQualityScore needs one prior list per run: ${runs.length} runs, ${priors.length} prior lists`);
  }
  if (runs.length === 0) return null;
  const sampleSize = runs.length;
  const adjustedSum = runs.reduce((sum, run) => sum + adjustedRunScore(run), 0);
  const versionPrior = priors.reduce((sum, pools) => sum + priorMean(pools), 0) / sampleSize;
  const priorWeight = qualityScoreWeights.priorWeight;
  return (priorWeight * versionPrior + adjustedSum) / (priorWeight + sampleSize);
}
