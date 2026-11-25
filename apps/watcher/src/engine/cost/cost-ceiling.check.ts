import { Inject, Injectable } from '@nestjs/common';
import type { CostLedgerPort } from '@studio/shared/ports';
import { type RunFile, type StageEstimate } from '@studio/shared/run-format';
import { type Clock } from '../clock';
import { CLOCK, COST_LEDGER } from '../engine.tokens';
import { ExecutorRegistry } from '../executor-registry';
import { ownerTexts } from '../owner-texts';
import { type PreflightVerdict } from '../seams';
import { planningContextFor, recipeStageOf, type StageWorkspace } from '../stage-workspace';
import { liveRunSpendUsd } from './run-spend';

function warned(detail: string): PreflightVerdict {
  return { status: 'passed', detail, caveat: true };
}

/** A figure a ceiling can be compared with: `NaN > limit` is false, so anything else is reported as invalid. */
export function isUsableUsd(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Built-in `preflight` cost ceilings (PRD 7.2 step 2, criteria 20 and 28, K4: checked in every
 * stage). The run estimate is what this run already billed (live cost.json) plus the estimate of
 * this stage and of every stage still pending. The month figure is the ledger's month-to-date
 * (`cost_entries` plus the live run's cost.json, deduplicated by run and session: SPEC 0002 rev 2)
 * plus only the pending estimate: the live run's billed spend is already inside month-to-date, so
 * adding it again would count it twice. Reaching either ceiling does not stop the run (owner
 * decision 2026-11-25): the step passes with a caveat that states both amounts, so `preflight` ends
 * `warning`. A figure that is not a finite, non-negative number (an executor estimate of NaN, an
 * unreadable ledger answer) is warned about the same way.
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
    if (![spentUsd, stageEstimate.usd, laterUsd, costPerRunUsd].every(isUsableUsd)) return warned(ownerTexts.costEstimateInvalidReason);
    if (runEstimateUsd > costPerRunUsd) return warned(ownerTexts.costRunReason(runEstimateUsd, costPerRunUsd));

    const monthToDateUsd = await this.ledger.monthToDateUsd(this.clock.now());
    const monthUsd = monthToDateUsd + pendingUsd;
    if (![monthToDateUsd, costPerMonthUsd].every(isUsableUsd)) return warned(ownerTexts.costEstimateInvalidReason);
    if (monthUsd > costPerMonthUsd) return warned(ownerTexts.costMonthReason(monthUsd, costPerMonthUsd));
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
