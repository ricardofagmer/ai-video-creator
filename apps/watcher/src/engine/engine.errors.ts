import { type RunId, type RunStatus, type StageId, type StepName, type StepStatus } from '@studio/shared/run-format';

/** Error taxonomy category (rules/observability.md); messages carry ids only, never paths or content. */
export type EngineErrorCategory = 'conflict' | 'dependency' | 'internal';

export abstract class EngineError extends Error {
  abstract readonly category: EngineErrorCategory;
}

export class RunNotRunnableError extends EngineError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: RunId,
    readonly status: RunStatus,
  ) {
    super(`Run ${runId} is ${status}; the watcher starts only runnable runs`);
    this.name = 'RunNotRunnableError';
  }
}

/**
 * SPEC 0002 A6: a held run (`waiting`, `paused`, `failed`, `interrupted`) continues only when the
 * api or CLI wrote the `resume` flag in control.json.
 */
export class ResumeNotRequestedError extends EngineError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: RunId,
    readonly status: RunStatus,
  ) {
    super(`Run ${runId} is ${status}; it resumes only after a resume request in control.json`);
    this.name = 'ResumeNotRequestedError';
  }
}

/** Abort reason handed to a step's `AbortSignal`; `kind` names why the engine interrupted it. */
export class StepInterruptedError extends EngineError {
  override readonly category = 'conflict';

  constructor(readonly kind: 'stop' | 'timeout' | 'cost-ceiling' | 'run-aborted' | 'shutdown') {
    super(`Step interrupted by the engine: ${kind}`);
    this.name = 'StepInterruptedError';
  }
}

/** The control and cost watch of a running step failed in an unexpected way. */
export class StepWatchError extends EngineError {
  override readonly category = 'internal';

  constructor(options: { cause: unknown }) {
    super('The step watch (control.json and cost.json polling) failed', options);
    this.name = 'StepWatchError';
  }
}

/** ADR 0003 single writer: a live pid in `watcher.pid` owns the run. */
export class RunOwnedByAnotherWatcherError extends EngineError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: RunId,
    readonly ownerPid: number,
  ) {
    super(`Run ${runId} is owned by the live watcher pid ${ownerPid}`);
    this.name = 'RunOwnedByAnotherWatcherError';
  }
}

/** This process is executing the run already; a second, re-entrant execution is refused. */
export class RunAlreadyExecutingError extends EngineError {
  override readonly category = 'conflict';

  constructor(readonly runId: RunId) {
    super(`Run ${runId} is already executing in this watcher`);
    this.name = 'RunAlreadyExecutingError';
  }
}

export class IllegalRunTransitionError extends EngineError {
  override readonly category = 'internal';

  constructor(
    readonly from: RunStatus,
    readonly to: RunStatus,
  ) {
    super(`The watcher may not move a run from ${from} to ${to}`);
    this.name = 'IllegalRunTransitionError';
  }
}

export class IllegalStepTransitionError extends EngineError {
  override readonly category = 'internal';

  constructor(
    readonly step: StepName,
    readonly from: StepStatus,
    readonly to: StepStatus,
  ) {
    super(`Step ${step} may not move from ${from} to ${to}`);
    this.name = 'IllegalStepTransitionError';
  }
}

export class MissingStageExecutorError extends EngineError {
  override readonly category = 'internal';

  constructor(readonly stageId: StageId) {
    super(`No stage executor is bound for stage ${stageId}`);
    this.name = 'MissingStageExecutorError';
  }
}

export class DuplicateStageExecutorError extends EngineError {
  override readonly category = 'internal';

  constructor(readonly stageId: StageId) {
    super(`More than one stage executor is bound for stage ${stageId}`);
    this.name = 'DuplicateStageExecutorError';
  }
}

export class StageNotFoundError extends EngineError {
  override readonly category = 'internal';

  constructor(readonly stageNumber: number) {
    super(`Run has no stage number ${stageNumber}`);
    this.name = 'StageNotFoundError';
  }
}

/** A step that needs the resolved assets found a binding that no longer resolves (resume path). */
export class BoundAssetUnavailableError extends EngineError {
  override readonly category = 'conflict';

  constructor(readonly problems: readonly string[]) {
    super(`Bound assets no longer resolve: ${problems.join('; ')}`);
    this.name = 'BoundAssetUnavailableError';
  }
}

/**
 * SPEC 0003 R2-07: the learning notes of a stage brief could not be read. The `brief` step fails
 * with this named reason instead of rendering a brief that silently lacks notes. The message names
 * the run, the stage and the cause's error class only, never a ref's note text.
 */
export class LearningNotesUnavailableError extends EngineError {
  override readonly category = 'dependency';
  readonly causeName: string;

  constructor(
    readonly runId: RunId,
    readonly stageNumber: number,
    options: { cause: unknown },
  ) {
    super(`Learning notes for run ${runId} stage ${stageNumber} could not be read: ${errorClassName(options.cause)}`, options);
    this.name = 'LearningNotesUnavailableError';
    this.causeName = errorClassName(options.cause);
  }
}

function errorClassName(cause: unknown): string {
  return cause instanceof Error ? cause.name : typeof cause;
}
