import { Inject, Injectable } from '@nestjs/common';
import type { CostLedgerPort } from '@studio/shared/ports';
import { type RunFile, type StageEstimate } from '@studio/shared/run-format';
import { type Clock } from '../clock';
import { CLOCK, COST_LEDGER } from '../engine.tokens';
import { ExecutorRegistry } from '../executor-registry';
import { ownerTexts } from '../owner-texts';
import { type PreflightVerdict } from '../seams';
import { planningContextFor, recipeStageOf, type StageWorkspace } from '../stage-workspace';
import { invalidEstimateWait, liveRunSpendUsd, monthEstimateWait, runEstimateWait, type CostCeilingWait } from './run-spend';

function waitVerdict(wait: CostCeilingWait): PreflightVerdict {
  return { status: 'failed', failure: { origin: 'guard', ...wait } };
}

/** A figure a ceiling can be compared with: `NaN > limit` is false, so anything else must fail closed. */
export function isUsableUsd(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Built-in `preflight` cost ceilings (PRD 7.2 step 2, criteria 20 and 28, K4: checked in every
 * stage). The run estimate is what this run already billed (live cost.json) plus the estimate of
 * this stage and of every stage still pending. The month figure is the ledger's month-to-date
 * (`cost_entries` plus the live run's cost.json, deduplicated by run and session: SPEC 0002 rev 2)
 * plus only the pending estimate: the live run's billed spend is already inside month-to-date, so
 * adding it again would count it twice. Reaching either ceiling is never retried: the step returns
 * a `guard` failure and the run waits. A figure that is not a finite, non-negative number (an
 * executor estimate of NaN, an unreadable ledger answer) fails closed the same way (baseline review).
 */
@Injectable()
export class CostCeilingCheck {
  constructor(
    @Inject(COST_LEDGER) private readonly ledger: CostLedgerPort,
    @Inject(ExecutorRegistry) private readonly executors: ExecutorRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async check(workspace: StageWorkspace, stageEstimate: StageEstimate): Promise<PreflightVerdict> {
    const run = workspace.active.snapshot;
    const { costPerRunUsd, costPerMonthUsd } = run.limits;
    const spentUsd = await liveRunSpendUsd(workspace.runDir);
    const laterUsd = await this.laterStagesEstimateUsd(run, workspace.location.stageNumber);
    const pendingUsd = stageEstimate.usd + laterUsd;
    const runEstimateUsd = spentUsd + pendingUsd;
    if (![spentUsd, stageEstimate.usd, laterUsd, costPerRunUsd].every(isUsableUsd)) return waitVerdict(invalidEstimateWait('run', costPerRunUsd));
    if (runEstimateUsd > costPerRunUsd) return waitVerdict(runEstimateWait(runEstimateUsd, costPerRunUsd));

    const monthToDateUsd = await this.ledger.monthToDateUsd(this.clock.now());
    const monthUsd = monthToDateUsd + pendingUsd;
    if (![monthToDateUsd, costPerMonthUsd].every(isUsableUsd)) return waitVerdict(invalidEstimateWait('month', costPerMonthUsd));
    if (monthUsd > costPerMonthUsd) return waitVerdict(monthEstimateWait(monthUsd, costPerMonthUsd));
    return { status: 'passed', detail: ownerTexts.costChecked(runEstimateUsd, costPerRunUsd, monthUsd, costPerMonthUsd) };
  }

  /** Estimates have no side effect and no paid call (C6), so every later stage can be asked. */
  private async laterStagesEstimateUsd(run: Readonly<RunFile>, stageNumber: number): Promise<number> {
    let total = 0;
    for (const stage of run.stages) {
      if (stage.number <= stageNumber || stage.outcome.status !== 'pending') continue;
      const recipeStage = recipeStageOf(run, stage.stageId);
      if (recipeStage?.enabled === false) continue;
      const context = planningContextFor(run, { stageNumber: stage.number, stageId: stage.stageId }, recipeStage?.params ?? {});
      total += (await this.executors.forStage(stage.stageId).estimate(context)).usd;
    }
    return total;
  }
}
