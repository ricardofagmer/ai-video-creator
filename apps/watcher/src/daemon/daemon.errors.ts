/** Error taxonomy category (rules/observability.md), as in `engine.errors.ts`. */
export type DaemonErrorCategory = 'internal';

export abstract class DaemonError extends Error {
  abstract readonly category: DaemonErrorCategory;
}

/** A8: one loop per process, so two runs never execute at once inside one daemon. */
export class DaemonLoopAlreadyRunningError extends DaemonError {
  override readonly category = 'internal';

  constructor() {
    super('The watcher daemon loop is already running in this process');
    this.name = 'DaemonLoopAlreadyRunningError';
  }
}
