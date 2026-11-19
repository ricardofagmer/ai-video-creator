import {
  type RecoveryRecord,
  type RunCursor,
  type RunFile,
  type StageRecord,
  type StepName,
  type StepRecord,
} from '@studio/shared/run-format';
import { StageNotFoundError } from './engine.errors';
import { type RecoveryNote } from './seams';
import { clip, textLimits } from './text';
import { assertStepReopen } from './transitions';

/**
 * Changes to the in-memory run.json that are not a single step or status move. Pure functions over
 * the draft `ActiveRun` hands them, so `ActiveRun` stays the only place that persists run.json.
 */

export interface StepLocation {
  stageNumber: number;
  step: StepName;
}

function stageAt(run: RunFile, stageNumber: number): StageRecord {
  const stage = run.stages[stageNumber - 1];
  if (stage === undefined) throw new StageNotFoundError(stageNumber);
  return stage;
}

function reopen(record: StepRecord, detail: string): void {
  assertStepReopen(record.step, record.status);
  record.status = 'pending';
  record.startedAt = null;
  record.endedAt = null;
  record.detail = clip(detail, textLimits.stepDetail);
}

function cursorAt(stage: StageRecord, step: StepName): RunCursor {
  const record = stage.steps.find((candidate) => candidate.step === step);
  return { stageNumber: stage.number, stageId: stage.stageId, step, attempt: (record?.attempts ?? 0) + 1 };
}

/** The first step of the next pending stage after `afterStageNumber`, or null after the last one. */
export function nextPendingCursor(run: Readonly<RunFile>, afterStageNumber: number): RunCursor | null {
  const next = run.stages.find((stage) => stage.number > afterStageNumber && stage.outcome.status === 'pending');
  return next === undefined ? null : { stageNumber: next.number, stageId: next.stageId, step: 'brief', attempt: 1 };
}

/**
 * Steps a crash or an internal error left `running` go back to `pending` (criterion 13); the
 * interrupted attempt stays counted. Returns where each one was, for the event log.
 */
export function settleOrphanedSteps(run: RunFile, detail: string): StepLocation[] {
  const settled: StepLocation[] = [];
  for (const stage of run.stages) {
    for (const record of stage.steps) {
      if (record.status !== 'running') continue;
      reopen(record, detail);
      settled.push({ stageNumber: stage.number, step: record.step });
    }
  }
  return settled;
}

/** Reopens settled steps of one stage so a Recovery rerun runs them again, in stage order. */
export function reopenSteps(run: RunFile, stageNumber: number, steps: readonly StepName[], detail: string): void {
  const stage = stageAt(run, stageNumber);
  for (const record of stage.steps) {
    if (steps.includes(record.step)) reopen(record, detail);
  }
  const first = stage.steps.find((record) => steps.includes(record.step));
  if (first !== undefined) run.cursor = cursorAt(stage, first.step);
}

/**
 * `rerun-previous-stage`: every stage from `fromStageNumber` to `toStageNumber` goes back to
 * `pending` with its steps reopened. Attempts and recoveries stay, so the rerun is bounded by the
 * same limits; recorded outputs are cleared because `record` hashes them again.
 */
export function resetStages(run: RunFile, range: { fromStageNumber: number; toStageNumber: number }, detail: string): void {
  for (let stageNumber = range.fromStageNumber; stageNumber <= range.toStageNumber; stageNumber += 1) {
    const stage = stageAt(run, stageNumber);
    if (stage.outcome.status === 'skipped') continue;
    for (const record of stage.steps) {
      if (record.status !== 'skipped') reopen(record, detail);
    }
    stage.outcome = { status: 'pending' };
    stage.outputs = [];
  }
  run.totals = { ...run.totals, stagesDelivered: run.stages.filter((stage) => stage.outcome.status === 'delivered').length };
  run.cursor = cursorAt(stageAt(run, range.fromStageNumber), 'brief');
}

/** Appends one Recovery call to the failed step; `number` counts the calls of the whole stage. */
export function appendRecovery(run: RunFile, location: StepLocation, note: RecoveryNote): RecoveryRecord {
  const stage = stageAt(run, location.stageNumber);
  const record = stage.steps.find((candidate) => candidate.step === location.step);
  if (record === undefined) throw new StageNotFoundError(location.stageNumber);
  const number = stage.steps.reduce((total, step) => total + step.recoveries.length, 0) + 1;
  const recovery: RecoveryRecord = { ...note, number };
  record.recoveries = [...record.recoveries, recovery];
  run.totals = {
    ...run.totals,
    recoveries: run.totals.recoveries + 1,
    recoveriesResolved: run.totals.recoveriesResolved + (note.resolved ? 1 : 0),
  };
  return recovery;
}
