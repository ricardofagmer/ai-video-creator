import { type RunId } from '@studio/shared/run-format';

/** Error taxonomy category (rules/observability.md), as in `daemon.errors.ts`. */
export type ScheduleStepErrorCategory = 'internal' | 'conflict';

export abstract class ScheduleStepError extends Error {
  abstract readonly category: ScheduleStepErrorCategory;
}

/**
 * K3 enforcement point: the schedule step was handed a run that is not a fresh `pending` run with
 * `createdBy: 'watcher'` and a `schedule` link. Nothing is written.
 */
export class ScheduledRunShapeRefusedError extends ScheduleStepError {
  override readonly category = 'internal';

  constructor(
    readonly runId: RunId,
    readonly problem: 'status-not-pending' | 'not-created-by-watcher' | 'schedule-link-missing',
  ) {
    super(`Refused to create scheduled run ${runId}: ${problem}`);
    this.name = 'ScheduledRunShapeRefusedError';
  }
}

/** The folder for a new scheduled run already exists; the one `run.json` write never overwrites. */
export class ScheduledRunExistsError extends ScheduleStepError {
  override readonly category = 'conflict';

  constructor(readonly runId: RunId) {
    super(`Run folder already exists for scheduled run ${runId}`);
    this.name = 'ScheduledRunExistsError';
  }
}

/** A run found for a slot after a crash no longer carries the slot's `schedule` link when re-read. */
export class ScheduledRunLinkMismatchError extends ScheduleStepError {
  override readonly category = 'conflict';

  constructor(readonly runId: RunId) {
    super(`Run ${runId} no longer carries the schedule link of its slot`);
    this.name = 'ScheduledRunLinkMismatchError';
  }
}
