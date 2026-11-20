import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InsightsViewSchema } from '@studio/shared/api';
import { calculateInsights, type InsightsFacts, type RunInsightFacts } from './insights.calculator';

const hourMs = 3_600_000;
const base = Date.parse('2026-11-01T00:00:00.000Z');

interface RunOptions {
  index: number;
  recipeId?: string;
  reviewAfterHours?: number | null;
  leftFailed?: boolean;
  catalog?: RunInsightFacts['catalog'];
  costUsd?: number;
  outcome?: { decision: string; rating: number } | null;
}

/** Run `index` is created `index` days after `base`; a higher index is a newer run. */
function run(options: RunOptions): RunInsightFacts {
  const createdAt = new Date(base + options.index * 24 * hourMs);
  const reviewAfterHours = options.reviewAfterHours === undefined ? 2 : options.reviewAfterHours;
  return {
    runId: `run-${String(options.index).padStart(3, '0')}`,
    recipeId: options.recipeId ?? 'product-tour',
    createdAt,
    costUsd: options.costUsd ?? 1,
    history:
      reviewAfterHours === null
        ? { status: 'unreadable' }
        : { status: 'read', reviewAt: new Date(createdAt.getTime() + reviewAfterHours * hourMs), leftFailed: options.leftFailed ?? false },
    catalog: options.catalog ?? { status: 'read', assetVersions: 4, fromCatalog: 4 },
    outcome:
      options.outcome === null
        ? null
        : { decision: options.outcome?.decision ?? 'approved', rating: options.outcome?.rating ?? 4, decidedAt: new Date(createdAt.getTime() + 3 * hourMs) },
  };
}

function facts(runs: RunInsightFacts[], overrides: Partial<InsightsFacts> = {}): InsightsFacts {
  return {
    computedAt: new Date('2026-11-19T12:00:00.000Z'),
    runs: [...runs].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    truncated: false,
    monthToDateUsd: 12.5,
    limits: { runUsd: 3, monthUsd: 60 },
    unapprovedPublications: 0,
    ...overrides,
  };
}

describe('calculateInsights', () => {
  it('gives a valid, empty view when no run reached review', () => {
    const view = calculateInsights(facts([]));

    assert.ok(InsightsViewSchema.safeParse(view).success);
    assert.equal(view.reviewReach.share, null);
    assert.equal(view.cost.costPerApprovedUsd, null);
    assert.deepEqual(view.reviewTime, []);
    assert.deepEqual(view.ratingTrend, []);
  });

  it('counts a run that left failed as repaired and a run with no history apart', () => {
    const view = calculateInsights(
      facts([run({ index: 1 }), run({ index: 2, leftFailed: true }), run({ index: 3 }), run({ index: 4, reviewAfterHours: null })]),
    );

    assert.deepEqual(view.reviewReach, { reachedReview: 3, withoutRepair: 2, share: 2 / 3, withoutHistory: 1 });
  });

  it('compares the first and latest run of each recipe, most recent recipe first', () => {
    const view = calculateInsights(
      facts([
        run({ index: 1, reviewAfterHours: 5 }),
        run({ index: 2, reviewAfterHours: 4 }),
        run({ index: 3, reviewAfterHours: 3 }),
        run({ index: 4, recipeId: 'ai-battle', reviewAfterHours: 1 }),
      ]),
    );

    assert.deepEqual(view.reviewTime, [
      { recipeId: 'ai-battle', runs: 1, firstRunMs: hourMs, latestRunMs: null, faster: null },
      { recipeId: 'product-tour', runs: 3, firstRunMs: 5 * hourMs, latestRunMs: 3 * hourMs, faster: true },
    ]);
  });

  it('applies the catalog target from the tenth run on and lists the latest runs newest first', () => {
    const runs = Array.from({ length: 12 }, (_, offset) =>
      run({ index: offset + 1, catalog: { status: 'read', assetVersions: 5, fromCatalog: offset + 1 >= 11 ? 4 : 3 } }),
    );
    runs.push(run({ index: 13, catalog: { status: 'unreadable' } }));
    const view = calculateInsights(facts(runs));

    assert.equal(view.catalogShare.fromTargetRun, 3);
    assert.equal(view.catalogShare.meetingTarget, 2);
    assert.equal(view.catalogShare.withoutManifest, 1);
    assert.equal(view.catalogShare.latestRuns.length, 10);
    assert.deepEqual(view.catalogShare.latestRuns[0], { runId: 'run-012', ordinal: 12, assetVersions: 5, fromCatalog: 4, share: 0.8 });
  });

  it('averages cost over approved runs and counts runs above the run ceiling', () => {
    const view = calculateInsights(
      facts([
        run({ index: 1, costUsd: 2 }),
        run({ index: 2, costUsd: 4 }),
        run({ index: 3, costUsd: 5, outcome: { decision: 'rejected', rating: 2 } }),
        run({ index: 4, costUsd: 1, outcome: null }),
      ]),
    );

    assert.equal(view.cost.approvedRuns, 2);
    assert.equal(view.cost.approvedCostUsd, 6);
    assert.equal(view.cost.costPerApprovedUsd, 3);
    assert.equal(view.cost.runsOverRunLimit, 2);
    assert.equal(view.cost.monthToDateUsd, 12.5);
  });

  it('holds the rating trend only once both windows of five are full', () => {
    const ratings = [3, 3, 3, 3, 3, 4, 4, 4, 4, 2];
    const runs = ratings.map((rating, offset) => run({ index: offset + 1, outcome: { decision: 'approved', rating } }));
    const view = calculateInsights(facts(runs));

    assert.deepEqual(view.ratingTrend, [{ recipeId: 'product-tour', latestMean: 3.6, latestCount: 5, previousMean: 3, previousCount: 5, holding: true }]);

    const short = calculateInsights(facts(runs.slice(0, 7)));
    assert.equal(short.ratingTrend[0]?.holding, null);
    assert.equal(short.ratingTrend[0]?.previousCount, 2);
  });
});
