/** Injected time source (rules/architecture.md: inject the clock), so tests can fix instants. */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** The process that executes runs; its pid goes into `watcher.pid` and `running.pid`. */
export interface WatcherProcess {
  readonly pid: number;
}
