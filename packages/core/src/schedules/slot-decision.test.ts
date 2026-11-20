import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Recipe } from '@studio/shared/recipes';
import { type RunStatus } from '@studio/shared/run-format';
import { type ScheduleBrief, type ScheduleFile } from '@studio/shared/schedules';
import { type RecipeVersionView } from '../recipes/recipe-version.mapper';
import { OPEN_RUN_STATUSES, decideSlot, selectBrief, type LastFiredRun, type SlotGuardFacts } from './slot-decision';

/*
 * The guard chain of SPEC 0006 section 5.6 (`decideSlot`), R3-AC-17 and K11: an unknown month
 * figure never fires; month-to-date at or over the recipe's `costPerMonthUsd` skips. The default
 * month ceiling is $60 (`defaultLimits`, `packages/shared/src/run-format/limits.ts`).
 */

function recipe(overrides: Partial<Pick<Recipe, 'status' | 'limits'>> = {}): Recipe {
  return {
    id: 'demo-recipe',
    version: 1,
    name: 'Demo recipe',
    description: '',
    status: 'active',
    owner: 'owner',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    provenance: null,
    notes: '',
    graph: { stages: [{ stageId: 'plan', enabled: true, checks: [], timeoutMs: null, params: {} }] },
    bindings: [],
    format: {
      canvas: { width: 1920, height: 1080 },
      aspect: '16:9',
      fps: 30,
      duration: { minSec: 30, maxSec: 90 },
      language: 'pt-BR',
      loudness: { integratedLufs: -14, truePeakDbtp: -1, toleranceLu: 1 },
      captions: { yPercent: 80, maxLines: 2 },
      narration: { maxWordsPerSecond: 3 },
      sceneCount: { min: 1, max: 10 },
    },
    gates: [],
    inputs: { required: [], keyMessages: { min: 0, max: 5 } },
    checks: [],
    limits: {},
    rubric: [],
    checklist: [],
    allowedKinds: ['template'],
    ...overrides,
  };
}

function version(overrides: Partial<Pick<Recipe, 'status' | 'limits'>> = {}): RecipeVersionView {
  return { ref: 'demo-recipe@1', contentHash: 'a'.repeat(64), recipe: recipe(overrides) };
}

const brief: ScheduleBrief = {
  briefId: '01JDA00000000000000000BR01',
  brief: { topic: 'Weekly product tour', keyMessages: [], format: '16:9', language: 'pt-BR', targetDurationSec: 60 },
  references: [],
};

function facts(overrides: Partial<SlotGuardFacts> = {}): SlotGuardFacts {
  return {
    lastFiredRun: { state: 'none' },
    runsAtReview: 0,
    brief,
    monthToDateUsd: 10,
    recipe: { state: 'found', version: version(), refsResolvable: true },
    ...overrides,
  };
}

describe('decideSlot: month spend (R3-AC-17)', () => {
  it('skips with month-spend-unavailable when the month figure is unknown', () => {
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: null })), { decision: 'skip', reasonId: 'month-spend-unavailable' });
  });

  it('treats a negative, NaN or infinite month figure as unknown', () => {
    for (const monthToDateUsd of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.deepEqual(decideSlot(facts({ monthToDateUsd })), { decision: 'skip', reasonId: 'month-spend-unavailable' }, String(monthToDateUsd));
    }
  });

  it('never fires with an unknown month figure, whatever the other facts are', () => {
    const lastRuns: readonly LastFiredRun[] = [{ state: 'none' }, { state: 'read', status: 'review' }, { state: 'read', status: 'approved' }];
    const recipes: readonly SlotGuardFacts['recipe'][] = [
      { state: 'missing' },
      { state: 'found', version: version(), refsResolvable: true },
      { state: 'found', version: version({ limits: { costPerMonthUsd: 1_000 } }), refsResolvable: false },
      { state: 'found', version: version({ status: 'deprecated' }), refsResolvable: true },
    ];
    for (const lastFiredRun of lastRuns) {
      for (const runsAtReview of [0, 2]) {
        for (const recipeState of recipes) {
          const decision = decideSlot(facts({ monthToDateUsd: null, lastFiredRun, runsAtReview, recipe: recipeState }));
          assert.deepEqual(decision, { decision: 'skip', reasonId: 'month-spend-unavailable' });
        }
      }
    }
  });

  it('skips with over-month-ceiling at the default $60 ceiling', () => {
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: 60 })), { decision: 'skip', reasonId: 'over-month-ceiling' });
  });

  it('skips with over-month-ceiling over the ceiling', () => {
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: 75.5 })), { decision: 'skip', reasonId: 'over-month-ceiling' });
  });

  it("uses the pinned recipe's own costPerMonthUsd", () => {
    const tight: SlotGuardFacts['recipe'] = { state: 'found', version: version({ limits: { costPerMonthUsd: 20 } }), refsResolvable: true };
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: 20, recipe: tight })), { decision: 'skip', reasonId: 'over-month-ceiling' });
    assert.equal(decideSlot(facts({ monthToDateUsd: 19.99, recipe: tight })).decision, 'fire');
  });

  it('skips at a zero ceiling even with zero spend', () => {
    const zero: SlotGuardFacts['recipe'] = { state: 'found', version: version({ limits: { costPerMonthUsd: 0 } }), refsResolvable: true };
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: 0, recipe: zero })), { decision: 'skip', reasonId: 'over-month-ceiling' });
  });

  it('fires just under the ceiling and carries the known figures', () => {
    const decision = decideSlot(facts({ monthToDateUsd: 59.99 }));
    if (decision.decision !== 'fire') assert.fail(`expected fire, got ${decision.reasonId}`);
    assert.equal(decision.monthToDateUsd, 59.99);
    assert.equal(decision.costPerMonthUsd, 60);
    assert.equal(decision.brief, brief);
  });
});

describe('decideSlot: the other guards, in order', () => {
  it('skips previous-run-open for every open status and for an unreadable last run', () => {
    for (const status of OPEN_RUN_STATUSES) {
      assert.deepEqual(decideSlot(facts({ lastFiredRun: { state: 'read', status } })), { decision: 'skip', reasonId: 'previous-run-open' }, status);
    }
    assert.deepEqual(decideSlot(facts({ lastFiredRun: { state: 'unreadable' } })), { decision: 'skip', reasonId: 'previous-run-open' });
  });

  it('does not hold the schedule for a last run that is settled', () => {
    const settled: readonly RunStatus[] = ['review', 'approved', 'rejected'];
    for (const status of settled) {
      assert.equal(decideSlot(facts({ lastFiredRun: { state: 'read', status } })).decision, 'fire', status);
    }
  });

  it('skips review-backlog with 3 runs at review', () => {
    assert.deepEqual(decideSlot(facts({ runsAtReview: 3 })), { decision: 'skip', reasonId: 'review-backlog' });
    assert.equal(decideSlot(facts({ runsAtReview: 2 })).decision, 'fire');
  });

  it('skips brief-queue-empty with no unused brief', () => {
    assert.deepEqual(decideSlot(facts({ brief: null })), { decision: 'skip', reasonId: 'brief-queue-empty' });
  });

  it('compares the month figure before the recipe status; a missing recipe has no ceiling to compare', () => {
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: 100, recipe: { state: 'missing' } })), { decision: 'skip', reasonId: 'recipe-not-runnable' });
    const deprecatedOver: SlotGuardFacts['recipe'] = { state: 'found', version: version({ status: 'deprecated' }), refsResolvable: true };
    assert.deepEqual(decideSlot(facts({ monthToDateUsd: 100, recipe: deprecatedOver })), { decision: 'skip', reasonId: 'over-month-ceiling' });
  });

  it('skips recipe-not-runnable for a missing or deprecated recipe', () => {
    assert.deepEqual(decideSlot(facts({ recipe: { state: 'missing' } })), { decision: 'skip', reasonId: 'recipe-not-runnable' });
    const deprecated: SlotGuardFacts['recipe'] = { state: 'found', version: version({ status: 'deprecated' }), refsResolvable: true };
    assert.deepEqual(decideSlot(facts({ recipe: deprecated })), { decision: 'skip', reasonId: 'recipe-not-runnable' });
  });

  it('skips bindings-unresolvable when a binding or reference no longer resolves', () => {
    const broken: SlotGuardFacts['recipe'] = { state: 'found', version: version(), refsResolvable: false };
    assert.deepEqual(decideSlot(facts({ recipe: broken })), { decision: 'skip', reasonId: 'bindings-unresolvable' });
  });

  it('fires a draft recipe, which is runnable', () => {
    const draft: SlotGuardFacts['recipe'] = { state: 'found', version: version({ status: 'draft' }), refsResolvable: true };
    assert.equal(decideSlot(facts({ recipe: draft })).decision, 'fire');
  });
});

describe('selectBrief', () => {
  const second: ScheduleBrief = { ...brief, briefId: '01JDA00000000000000000BR02' };

  it('queue mode takes the first unused brief, then none', () => {
    const schedule: Pick<ScheduleFile, 'briefMode' | 'briefs'> = { briefMode: 'queue', briefs: [brief, second] };
    assert.equal(selectBrief(schedule, new Set()), brief);
    assert.equal(selectBrief(schedule, new Set([brief.briefId])), second);
    assert.equal(selectBrief(schedule, new Set([brief.briefId, second.briefId])), null);
  });
});
