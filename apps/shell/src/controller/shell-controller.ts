import { type InvokerStatus, type StudioAction, type StudioInvoker } from '../actions/studio-invoker';
import { logDiagnostic } from '../logging/diagnostics';
import { deriveShellState, type FastInputs, type ShellState, type SlowInputs } from '../state/state-model';

/*
 * Polling decision: heartbeat and pid records every 5 s (the heartbeat is written every 2 s and is
 * stale after 10 s); schedules and runs every 60 s, once when the menu opens, and after every action.
 * No file watcher on the data home: a timer reads a handful of small files and holds no descriptor.
 */
export const FAST_POLL_MS = 5_000;
export const SLOW_POLL_MS = 60_000;

export interface ShellSnapshot {
  readonly state: ShellState;
  readonly action: InvokerStatus;
}

/** Returns a cancel function. */
export type StartInterval = (periodMs: number, callback: () => void) => () => void;

export interface ShellControllerOptions {
  readonly readFast: () => Promise<FastInputs>;
  readonly readSlow: (nowMs: number) => Promise<SlowInputs>;
  readonly invoker: StudioInvoker;
  readonly now: () => number;
  readonly isProcessAlive: (pid: number) => boolean;
  readonly startInterval: StartInterval;
  readonly render: (snapshot: ShellSnapshot) => void;
}

/** Holds the latest inputs, schedules the reads and renders once both kinds have been read. */
export class ShellController {
  private fast: FastInputs | null = null;
  private slow: SlowInputs | null = null;
  private fastReading = false;
  private slowReading = false;
  private readonly cancels: Array<() => void> = [];
  private lastSkipped = { schedules: 0, runs: 0 };

  constructor(private readonly options: ShellControllerOptions) {
    options.invoker.subscribe((status) => this.onActionStatus(status));
  }

  async start(): Promise<void> {
    await Promise.all([this.refreshFast(), this.refreshSlow()]);
    this.cancels.push(this.options.startInterval(FAST_POLL_MS, () => void this.refreshFast()));
    this.cancels.push(this.options.startInterval(SLOW_POLL_MS, () => void this.refreshSlow()));
  }

  stop(): void {
    for (const cancel of this.cancels.splice(0)) cancel();
  }

  requestAction(action: StudioAction): void {
    const request = this.options.invoker.request(action);
    if (request.status === 'refused') {
      logDiagnostic({ event: 'action-refused', action, reason: request.reason });
      return;
    }
    logDiagnostic({ event: 'action-started', action });
  }

  async refreshFast(): Promise<void> {
    if (this.fastReading) return;
    this.fastReading = true;
    try {
      this.fast = await this.options.readFast();
      this.render();
    } catch {
      logDiagnostic({ event: 'refresh-failed', reason: 'fast-inputs' });
    } finally {
      this.fastReading = false;
    }
  }

  async refreshSlow(): Promise<void> {
    if (this.slowReading) return;
    this.slowReading = true;
    try {
      this.slow = await this.options.readSlow(this.options.now());
      this.reportSkipped(this.slow);
      this.render();
    } catch {
      logDiagnostic({ event: 'refresh-failed', reason: 'slow-inputs' });
    } finally {
      this.slowReading = false;
    }
  }

  private onActionStatus(status: InvokerStatus): void {
    if (status.phase === 'unresponsive') logDiagnostic({ event: 'action-unresponsive', action: status.action });
    if (status.phase === 'idle' && status.last !== null) {
      const { action, outcome } = status.last;
      logDiagnostic({
        event: 'action-finished',
        action,
        reason: outcome.kind,
        ...(outcome.kind === 'failed' ? { exitCode: outcome.exitCode } : {}),
      });
      // The services just changed; show it now rather than at the next tick.
      void this.refreshFast();
      void this.refreshSlow();
    }
    this.render();
  }

  /** Counts only, and only when they change, so a broken file does not log every minute. */
  private reportSkipped(slow: SlowInputs): void {
    const schedules = slow.schedules.status === 'ok' ? slow.schedules.skipped : 0;
    const runs = slow.reviews.status === 'ok' ? slow.reviews.skipped : 0;
    if (schedules !== this.lastSkipped.schedules) logDiagnostic({ event: 'schedules-skipped', counts: { skipped: schedules } });
    if (runs !== this.lastSkipped.runs) logDiagnostic({ event: 'runs-skipped', counts: { skipped: runs } });
    this.lastSkipped = { schedules, runs };
  }

  private render(): void {
    if (this.fast === null || this.slow === null) return;
    const state = deriveShellState(this.fast, this.slow, { nowMs: this.options.now(), isProcessAlive: this.options.isProcessAlive });
    this.options.render({ state, action: this.options.invoker.current() });
  }
}
