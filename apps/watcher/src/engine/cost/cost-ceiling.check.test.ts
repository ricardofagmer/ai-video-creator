import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AssetResolverPort, CostLedgerPort, StageExecutorPort, StagePlanningContext } from '@studio/shared/ports';
import { readRunFile } from '@studio/shared/run-files';
import { type JsonObject, type RunFile, type StageEstimate, type StageId } from '@studio/shared/run-format';
import { MockLearningNotes } from '../../mocks/mock-learning-notes';
import { ActiveRun } from '../active-run';
import { NextBriefDrafter } from '../brief/next-brief.drafter';
import { StageBriefComposer } from '../brief/stage-brief.composer';
import { type Clock } from '../clock';
import { ExecutorRegistry } from '../executor-registry';
import { ownerTexts } from '../owner-texts';
import { emptyBaseline } from '../run-budget';
import { type PreflightVerdict } from '../seams';
import { StageWorkspace } from '../stage-workspace';
import { ExecuteStep } from '../steps/execute.step';
import { CostCeilingCheck } from './cost-ceiling.check';

/*
 * Cost ceilings fail closed (baseline review): a NaN or infinite estimate, spend or ledger figure
 * compares false against a ceiling, so `CostCeilingCheck` must refuse it instead of passing it. And
 * a retried `execute` (Recovery `retry-step` / `retry-with-params`, which skip `preflight`) checks the
 * ceilings again with the estimate of the params in force before the executor runs. The run is the
 * offline fixture; its run folder is a temp dir with no cost.json, so the live spend is $0. Nothing
 * is executed: the fake executor's `execute` records a call and the tests assert it never happens.
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');
const NOW = new Date('2026-11-21T12:00:00.000Z');
const PLAN_STAGE = { stageNumber: 1, stageId: 'plan' } as const satisfies { stageNumber: number; stageId: StageId };

const clock: Clock = { now: () => NOW };

function usd(value: number): StageEstimate {
  return { tokens: 0, ttsChars: 0, renderSec: 0, usd: value };
}

class FakeExecutor implements StageExecutorPort {
  readonly estimatedParams: JsonObject[] = [];

  constructor(
    readonly stageId: StageId,
    private readonly estimateUsd: () => number,
  ) {}

  async estimate(context: StagePlanningContext): Promise<StageEstimate> {
    this.estimatedParams.push(context.params);
    return usd(this.estimateUsd());
  }

  declaredOutputs(): [] {
    return [];
  }

  async execute(): Promise<never> {
    throw new Error('the fake executor runs no stage');
  }

  async verify(): Promise<[]> {
    return [];
  }
}

const resolver: AssetResolverPort = {
  resolve: async () => {
    throw new Error('no asset is resolved by a cost check');
  },
};

function ledgerAnswering(monthToDateUsd: number): CostLedgerPort {
  return {
    priceTableVersion: 'test',
    priceUsd: () => 0,
    record: async () => {
      throw new Error('a cost check records nothing');
    },
    monthToDateUsd: async () => monthToDateUsd,
  };
}

interface Rig {
  check: CostCeilingCheck;
  workspace: StageWorkspace;
  planExecutor: FakeExecutor;
}

let fixture: RunFile;
let runDir: string;

beforeEach(async () => {
  fixture = await readRunFile(FIXTURE_DIR);
  runDir = await mkdtemp(join(tmpdir(), 'cost-ceiling-'));
});

afterEach(async () => {
  await rm(runDir, { recursive: true, force: true });
});

function rig(options: { planUsd: () => number; laterUsd?: () => number; monthToDateUsd?: number }): Rig {
  const stageIds = [...new Set(fixture.stages.map((stage) => stage.stageId))];
  const executors = stageIds.map((stageId) => new FakeExecutor(stageId, stageId === 'plan' ? options.planUsd : (options.laterUsd ?? (() => 0))));
  const planExecutor = executors.find((executor) => executor.stageId === 'plan');
  if (planExecutor === undefined) throw new Error('the fixture has a plan stage');
  const registry = new ExecutorRegistry(executors);
  const active = new ActiveRun({ runDir, run: fixture, pid: 4242, clock, baseline: emptyBaseline });
  const workspace = new StageWorkspace({ active, location: PLAN_STAGE, executor: planExecutor, resolver });
  return { check: new CostCeilingCheck(ledgerAnswering(options.monthToDateUsd ?? 0), registry, clock), workspace, planExecutor };
}

/** Owner decision 2026-11-25: a ceiling never stops the run; the verdict passes with a caveat the owner sees. */
function assertInvalidEstimateWarned(verdict: PreflightVerdict): void {
  assert.deepEqual(verdict, { status: 'passed', detail: ownerTexts.costEstimateInvalidReason, caveat: true });
}

describe('CostCeilingCheck warns about figures that cannot be compared', () => {
  it('passes a finite estimate under both ceilings, with no caveat', async () => {
    const { check, workspace } = rig({ planUsd: () => 0.5 });
    const verdict = await check.check(workspace, usd(0.5));
    assert.equal(verdict.status, 'passed');
    assert.equal(verdict.status === 'passed' && verdict.caveat === true, false);
  });

  it('warns, with both amounts, when the estimate passes the run ceiling', async () => {
    // costPerRunUsd is 3 in the fixture.
    const { check, workspace } = rig({ planUsd: () => 10 });
    assert.deepEqual(await check.check(workspace, usd(10)), { status: 'passed', detail: ownerTexts.costRunReason(10, 3), caveat: true });
  });

  it('warns about a NaN stage estimate', async () => {
    const { check, workspace } = rig({ planUsd: () => Number.NaN });
    assertInvalidEstimateWarned(await check.check(workspace, usd(Number.NaN)));
  });

  it('warns when a later stage estimates Infinity', async () => {
    const { check, workspace } = rig({ planUsd: () => 0.1, laterUsd: () => Number.POSITIVE_INFINITY });
    assertInvalidEstimateWarned(await check.check(workspace, usd(0.1)));
  });

  it('warns when the ledger answers NaN for the month', async () => {
    const { check, workspace } = rig({ planUsd: () => 0.1, monthToDateUsd: Number.NaN });
    assertInvalidEstimateWarned(await check.check(workspace, usd(0.1)));
  });

  it('warns about a negative estimate', async () => {
    const { check, workspace } = rig({ planUsd: () => -1 });
    assertInvalidEstimateWarned(await check.check(workspace, usd(-1)));
  });
});

describe('ExecuteStep estimates again before a retried attempt and never stops on a ceiling', () => {
  // The fixture run has no stage brief on disk, so a step that got past the cost check stops reading it.
  // A ceiling that still held the attempt would return a `guard` failure instead of rejecting.
  const PAST_THE_COST_CHECK = { name: 'RunFileNotFoundError' };

  function executeStep(check: CostCeilingCheck): ExecuteStep {
    const drafter = new NextBriefDrafter(new ExecutorRegistry([]), clock, new StageBriefComposer(new MockLearningNotes()));
    return new ExecuteStep(drafter, check);
  }

  it('runs a retry-step attempt whose estimate passes the run ceiling', async () => {
    // costPerRunUsd is 3 in the fixture; preflight passed earlier in this execution.
    const { check, workspace } = rig({ planUsd: () => 10 });
    workspace.markCostChecked();
    await assert.rejects(executeStep(check).run({ workspace, attempt: 2, stepKey: 'plan:execute:2', signal: new AbortController().signal }), PAST_THE_COST_CHECK);
  });

  it('estimates with the patched params of a retry-with-params, whose new params preflight never saw', async () => {
    const { check, workspace, planExecutor } = rig({ planUsd: () => 10 });
    workspace.markCostChecked();
    workspace.useParams({ ...workspace.recipeParams(), patchedForRetry: 2 });
    await assert.rejects(executeStep(check).run({ workspace, attempt: 1, stepKey: 'plan:execute:1', signal: new AbortController().signal }), PAST_THE_COST_CHECK);
    assert.equal(planExecutor.estimatedParams.at(-1)?.patchedForRetry, 2);
  });

  it('runs a retried attempt whose estimate is NaN', async () => {
    const { check, workspace } = rig({ planUsd: () => Number.NaN });
    await assert.rejects(executeStep(check).run({ workspace, attempt: 3, stepKey: 'plan:execute:3', signal: new AbortController().signal }), PAST_THE_COST_CHECK);
  });
});
