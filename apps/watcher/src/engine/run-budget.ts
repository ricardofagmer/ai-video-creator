import { type RecoveryRecord, type RunFile, type StageRecord, type StepName, type StepRecord } from '@studio/shared/run-format';

/**
 * Attempts and Recovery calls already spent when the owner resumed a held run. They stay in
 * run.json for the audit trail but do not count against the resumed execution: otherwise a run
 * resumed from `failed` would fail again before its step ran (PRD 7.3 "resume continues from the
 * exact step"). A crash resume takes no baseline, so a step that crashes the watcher repeatedly
 * still exhausts its attempts.
 */
export interface BudgetBaseline {
  readonly attempts: ReadonlyMap<string, number>;
  readonly recoveries: ReadonlyMap<string, number>;
}

export const emptyBaseline: BudgetBaseline = { attempts: new Map(), recoveries: new Map() };

/** StepRecord caps `recoveries` at 20; past it the run.json write would fail validation. */
export const MAX_RECOVERY_RECORDS_PER_STEP = 20;

function budgetKey(stageNumber: number, step: StepName): string {
  return `${stageNumber}:${step}`;
}

export function captureBaseline(run: Readonly<RunFile>): BudgetBaseline {
  const attempts = new Map<string, number>();
  const recoveries = new Map<string, number>();
  for (const stage of run.stages) {
    for (const record of stage.steps) {
      attempts.set(budgetKey(stage.number, record.step), record.attempts);
      recoveries.set(budgetKey(stage.number, record.step), record.recoveries.length);
    }
  }
  return { attempts, recoveries };
}

/** What this execution has spent of `limits.attemptsPerStep` and `limits.recoveriesPerStage`. */
export class RunBudget {
  constructor(private readonly baseline: BudgetBaseline) {}

  attemptsUsed(stageNumber: number, record: Readonly<StepRecord>): number {
    return Math.max(0, record.attempts - (this.baseline.attempts.get(budgetKey(stageNumber, record.step)) ?? 0));
  }

  recoveriesSince(stageNumber: number, record: Readonly<StepRecord>): readonly RecoveryRecord[] {
    return record.recoveries.slice(this.baseline.recoveries.get(budgetKey(stageNumber, record.step)) ?? 0);
  }

  stageRecoveriesUsed(stage: Readonly<StageRecord>): number {
    return stage.steps.reduce((total, record) => total + this.recoveriesSince(stage.number, record).length, 0);
  }
}
