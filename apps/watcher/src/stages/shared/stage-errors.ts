import { type StageId } from '@studio/shared/run-format';

/**
 * Programming and wiring faults of the stage executors. Expected failures (a tool error, a missing
 * claim, a refused credential) are returned as C6 `StageFailure`s instead; these are thrown only
 * when the executor itself is wired wrong, and the engine records them as faults.
 */

export class MissingStageInputError extends Error {
  constructor(
    readonly stageId: StageId,
    readonly inputName: string,
  ) {
    super(`Stage ${stageId} needs the earlier output "${inputName}", which its stage brief does not list`);
    this.name = 'MissingStageInputError';
  }
}

export class UndeclaredStageOutputError extends Error {
  constructor(
    readonly stageId: StageId,
    readonly outputName: string,
  ) {
    super(`Stage ${stageId} tried to write "${outputName}", which its stage brief does not declare`);
    this.name = 'UndeclaredStageOutputError';
  }
}
