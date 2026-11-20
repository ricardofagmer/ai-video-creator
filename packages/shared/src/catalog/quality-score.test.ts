import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { platformBaseline, platformSignal, type PlatformSnapshotInForce } from '../metrics/platform-signal';
import { type PlatformMetrics } from '../metrics/snapshot';
import {
  QUALITY_SCORE_FORMULA_VERSION,
  adjustedRunScore,
  computeQualityScore,
  qualityPlatformSampleSize,
  qualityScoreWeights,
  type QualityPriorPool,
  type QualityScoreRun,
} from './quality-score';

/*
 * `qualityScore` formula version 2 (SPEC 0006 section 5.4, R3-AC-05) and the unchanged SPEC 0003
 * section 5.1 worked examples (R2-AC-02).
 */

function metrics(values: Partial<PlatformMetrics> & Pick<PlatformMetrics, 'views'>): PlatformMetrics {
  return {
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
    ...values,
  };
}

function youtube(values: Partial<PlatformMetrics> & Pick<PlatformMetrics, 'views'>): PlatformSnapshotInForce {
  return { platform: 'youtube', metrics: metrics(values) };
}

function run(values: Omit<QualityScoreRun, 'platformSignal'> & Partial<Pick<QualityScoreRun, 'platformSignal'>>): QualityScoreRun {
  return { platformSignal: null, ...values };
}

function recipePool(meanAdjustedScore: number, runCount: number): readonly QualityPriorPool[] {
  return [{ meanAdjustedScore, runCount }];
}

/** SPEC 0003 first worked example: runs A to D of `roteiro-tour@3`. */
const runA = run({ rating: 5, reviewerOverall: 4.5, qaOutcome: 'passed', recoveries: 0 });
const runB = run({ rating: 4, reviewerOverall: 4.0, qaOutcome: 'passed-with-warnings', recoveries: 1 });
const runC = run({ rating: 4, reviewerOverall: null, qaOutcome: 'passed', recoveries: 0 });
const runD = run({ rating: 2, reviewerOverall: 3.0, qaOutcome: 'passed', recoveries: 3 });

/** SPEC 0006 5.4: a baseline of 6 YouTube videos (medViews 1000, medEr 0.040, medRet 40) and run B's snapshot. */
const runBSnapshot = youtube({ views: 4000, likes: 200, comments: 20, shares: 30, saves: null, averageViewPercent: 45 });
const baselineSnapshots: readonly PlatformSnapshotInForce[] = [
  youtube({ views: 500, likes: 15, averageViewPercent: 30 }),
  youtube({ views: 800, likes: 28, averageViewPercent: 35 }),
  youtube({ views: 1000, likes: 40, averageViewPercent: 40 }),
  youtube({ views: 1000, likes: 40, averageViewPercent: 40 }),
  youtube({ views: 2000, likes: 100, averageViewPercent: 50 }),
  runBSnapshot,
];

function runBPlatformSignal(): number {
  const signal = platformSignal([runBSnapshot], { youtube: platformBaseline('youtube', baselineSnapshots) });
  if (signal === null) assert.fail('the worked-example fixture has a baseline and an eligible snapshot');
  return signal;
}

function scoreOrFail(runs: readonly QualityScoreRun[], priors: readonly (readonly QualityPriorPool[])[]): number {
  const score = computeQualityScore(runs, priors);
  if (score === null) assert.fail('expected a score for reviewed runs');
  return score;
}

/** Version 1 of SPEC 0003, written out independently in the same term order. */
function versionOneAdjusted(input: QualityScoreRun): number {
  const reviewer = input.reviewerOverall === null ? 0 : (0.2 * (input.reviewerOverall - 3)) / 2;
  const qa = input.qaOutcome === 'passed' ? 0.1 : input.qaOutcome === 'passed-with-warnings' ? -0.1 : 0;
  const recovery = (0.1 * Math.min(input.recoveries, 2)) / 2;
  return Math.min(5, Math.max(1, input.rating + reviewer + qa - recovery));
}

function assertClose(actual: number, expected: number, tolerance: number): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected} +/- ${tolerance}, got ${actual}`);
}

describe('computeQualityScore version 2', () => {
  it('is formula version 2 with W_PLATFORM 0.30', () => {
    assert.equal(QUALITY_SCORE_FORMULA_VERSION, 2);
    assert.equal(qualityScoreWeights.platform, 0.3);
  });

  it('reproduces the 5.4 worked example: 3.630, sample sizes 4 and 1', () => {
    const runs = [runA, { ...runB, platformSignal: runBPlatformSignal() }, runC, runD];
    const priors = runs.map(() => recipePool(3.41, 12));
    assertClose(adjustedRunScore(runs[1] ?? runB), 4.079, 0.001);
    assertClose(scoreOrFail(runs, priors), 3.63, 0.001);
    assert.equal(runs.length, 4);
    assert.equal(qualityPlatformSampleSize(runs), 1);
  });

  it('returns 3.607 after the snapshot is removed', () => {
    const runs = [runA, runB, runC, runD];
    const priors = runs.map(() => recipePool(3.4, 12));
    assertClose(scoreOrFail(runs, priors), 3.607, 0.001);
    assert.equal(qualityPlatformSampleSize(runs), 0);
  });

  it('bounds the platform nudge to +/- 0.30 per run', () => {
    const base = run({ rating: 3, reviewerOverall: null, qaOutcome: 'absent', recoveries: 0 });
    assertClose(adjustedRunScore({ ...base, platformSignal: 1 }), 3.3, 1e-12);
    assertClose(adjustedRunScore({ ...base, platformSignal: -1 }), 2.7, 1e-12);
  });

  it('still clamps the adjusted score to [1, 5]', () => {
    assert.equal(adjustedRunScore(run({ rating: 5, reviewerOverall: 5, qaOutcome: 'passed', recoveries: 0, platformSignal: 1 })), 5);
    assert.equal(adjustedRunScore(run({ rating: 1, reviewerOverall: 1, qaOutcome: 'passed-with-warnings', recoveries: 5, platformSignal: -1 })), 1);
  });

  it('refuses a platform signal outside [-1, 1]', () => {
    const base = run({ rating: 3, reviewerOverall: null, qaOutcome: 'absent', recoveries: 0 });
    assert.throws(() => adjustedRunScore({ ...base, platformSignal: 1.01 }), RangeError);
    assert.throws(() => adjustedRunScore({ ...base, platformSignal: Number.NaN }), RangeError);
  });
});

describe('SPEC 0003 worked examples (unchanged by version 2)', () => {
  it('first example: 3.607 with n = 4', () => {
    const runs = [runA, runB, runC, runD];
    assert.deepEqual(
      runs.map((item) => Math.round(adjustedRunScore(item) * 100) / 100),
      [5, 3.95, 4.1, 2],
    );
    assertClose(scoreOrFail(runs, runs.map(() => recipePool(3.4, 12))), 3.607, 0.001);
  });

  it('second example: 3.500 with n = 1 and the neutral prior', () => {
    const first = run({ rating: 5, reviewerOverall: 4.0, qaOutcome: 'passed', recoveries: 0 });
    const smallPools: readonly QualityPriorPool[] = [
      { meanAdjustedScore: 5, runCount: 1 },
      { meanAdjustedScore: 5, runCount: 1 },
      { meanAdjustedScore: 5, runCount: 1 },
    ];
    assertClose(scoreOrFail([first], [smallPools]), 3.5, 0.001);
  });

  it('is null with no reviewed run', () => {
    assert.equal(computeQualityScore([], []), null);
  });
});

describe('platformSignal null equals version 1', () => {
  const qaOutcomes: readonly QualityScoreRun['qaOutcome'][] = ['passed', 'passed-with-warnings', 'absent'];

  it('gives exactly the version 1 adjusted score for every input combination', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      for (const reviewerOverall of [null, 1, 2.5, 3, 4.5, 5]) {
        for (const qaOutcome of qaOutcomes) {
          for (const recoveries of [0, 1, 2, 7]) {
            const input = run({ rating, reviewerOverall, qaOutcome, recoveries });
            assert.equal(adjustedRunScore(input), versionOneAdjusted(input));
          }
        }
      }
    }
  });

  it('gives exactly the version 1 score for the first worked example', () => {
    const runs = [runA, runB, runC, runD];
    const versionOneSum = runs.reduce((sum, item) => sum + versionOneAdjusted(item), 0);
    const versionOnePrior = runs.reduce((sum) => sum + 3.4, 0) / runs.length;
    const versionOne = (3 * versionOnePrior + versionOneSum) / (3 + runs.length);
    assert.equal(computeQualityScore(runs, runs.map(() => recipePool(3.4, 12))), versionOne);
  });
});
