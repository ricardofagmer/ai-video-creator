import {
  adjustedRunScore,
  computeQualityScore,
  qualityPlatformSampleSize,
  type QualityPriorPool,
  type QualityScoreRun,
} from '@studio/shared/catalog';

/** One reviewed run: its formula input, the recipe id it ran and the asset versions it used. */
export interface ScoredOutcome {
  runId: string;
  recipeId: string;
  run: QualityScoreRun;
  assetVersionIds: readonly number[];
}

/** One catalog version to score: its row id and its asset kind. */
export interface ScoredVersion {
  id: number;
  kind: string;
}

export interface VersionScore {
  id: number;
  /** Null exactly when `qualitySampleSize` is 0. */
  qualityScore: number | null;
  qualitySampleSize: number;
  /** SPEC 0006 section 5.4: the runs of the sample with a platform signal; at most `qualitySampleSize`. */
  qualityPlatformSampleSize: number;
}

interface PoolTotal {
  sum: number;
  count: number;
}

function addToPool<Key>(pools: Map<Key, PoolTotal>, key: Key, adjusted: number): void {
  const pool = pools.get(key) ?? { sum: 0, count: 0 };
  pool.sum += adjusted;
  pool.count += 1;
  pools.set(key, pool);
}

function toPrior(pool: PoolTotal | undefined): QualityPriorPool[] {
  return pool === undefined ? [] : [{ meanAdjustedScore: pool.sum / pool.count, runCount: pool.count }];
}

/**
 * Scores every version from every reviewed run (SPEC 0003 section 5.1, B2-B5; formula version 2 of
 * SPEC 0006 section 5.4, whose platform term each `run` already carries). The adjusted run
 * score `s` and the final score come from the shared formula only (`adjustedRunScore`,
 * `computeQualityScore`), so no weight or prior constant is repeated here. This function builds
 * the three pools of B3, in order: the run's recipe id, the version's asset kind, all reviewed
 * runs; pools include the version's own runs, and the shared formula falls back to the neutral
 * prior when none reaches the minimum size. Callers pass rows in a stable order, so the same
 * inputs always give the same doubles and a repeated rescore changes no value.
 */
export function scoreCatalog(outcomes: readonly ScoredOutcome[], versions: readonly ScoredVersion[]): VersionScore[] {
  const kindByVersionId = new Map(versions.map((version) => [version.id, version.kind]));
  const recipePools = new Map<string, PoolTotal>();
  const kindPools = new Map<string, PoolTotal>();
  const allRuns: PoolTotal = { sum: 0, count: 0 };
  const outcomesByVersionId = new Map<number, ScoredOutcome[]>();

  for (const outcome of outcomes) {
    const adjusted = adjustedRunScore(outcome.run);
    addToPool(recipePools, outcome.recipeId, adjusted);
    allRuns.sum += adjusted;
    allRuns.count += 1;
    // A run counts once per kind, however many versions of that kind it used.
    const kinds = new Set<string>();
    for (const versionId of outcome.assetVersionIds) {
      const kind = kindByVersionId.get(versionId);
      if (kind !== undefined) kinds.add(kind);
      const used = outcomesByVersionId.get(versionId) ?? [];
      used.push(outcome);
      outcomesByVersionId.set(versionId, used);
    }
    for (const kind of kinds) addToPool(kindPools, kind, adjusted);
  }

  const globalPool = allRuns.count === 0 ? undefined : allRuns;
  return versions.map((version): VersionScore => {
    const used = outcomesByVersionId.get(version.id) ?? [];
    const priors = used.map((outcome) => [
      ...toPrior(recipePools.get(outcome.recipeId)),
      ...toPrior(kindPools.get(version.kind)),
      ...toPrior(globalPool),
    ]);
    const runs = used.map((outcome) => outcome.run);
    const qualityScore = computeQualityScore(runs, priors);
    if (qualityScore === null) return { id: version.id, qualityScore, qualitySampleSize: 0, qualityPlatformSampleSize: 0 };
    return { id: version.id, qualityScore, qualitySampleSize: runs.length, qualityPlatformSampleSize: qualityPlatformSampleSize(runs) };
  });
}
