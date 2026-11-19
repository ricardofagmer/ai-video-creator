import { RunFileError } from '@studio/shared/run-files';
import { type ActiveRun } from '../active-run';
import { liveRunSpendUsd } from '../cost/run-spend';
import { StepInterruptedError, StepWatchError } from '../engine.errors';
import { ownerTexts } from '../owner-texts';
import { type RunControlChannel } from '../seams';

/** Often enough for criterion 14 (2 s) and for a `stop` to reach a long step promptly. */
export const STEP_WATCH_INTERVAL_MS = 500;

/** Why the engine aborted a step's signal; the first cause wins. */
export type StepInterruption =
  | { kind: 'stop'; reason: string }
  | { kind: 'timeout'; timeoutMs: number }
  | { kind: 'cost-ceiling'; spentUsd: number; limitUsd: number }
  | { kind: 'run-aborted' }
  /** R1-09: the watcher process is shutting down; the run is left for crash-resume, not `interrupted`. */
  | { kind: 'shutdown' };

export interface StepGuardOptions {
  active: ActiveRun;
  control: RunControlChannel;
  timeoutMs: number;
  /** Optional `WATCHER_SHUTDOWN` signal; absent outside the daemon. */
  shutdown?: AbortSignal;
}

/**
 * The `AbortSignal` of one step attempt or Recovery call (topology section 7, RUN-FORMAT 12). It
 * aborts on the step timeout, on a `stop` in control.json, when the live cost.json total crosses
 * `limits.costPerRunUsd`, when the watcher shuts down (R1-09), or when the whole execution aborts.
 * The signal reaches the executor, every tool and `AgentsPort.run(..., { signal })`.
 */
export class StepGuard {
  private readonly controller = new AbortController();
  private interruptionValue: StepInterruption | null = null;
  private unexpected: unknown = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private watcher: ReturnType<typeof setInterval> | null = null;
  private inspecting = false;
  private closed = false;
  private pauseNoticeShown = false;
  private readonly onRunAbort = (): void => this.interrupt({ kind: 'run-aborted' });
  private readonly onShutdown = (): void => this.interrupt({ kind: 'shutdown' });

  constructor(private readonly options: StepGuardOptions) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get interruption(): StepInterruption | null {
    return this.interruptionValue;
  }

  open(): this {
    const runSignal = this.options.active.signal;
    if (runSignal.aborted) this.interrupt({ kind: 'run-aborted' });
    else runSignal.addEventListener('abort', this.onRunAbort, { once: true });
    const shutdown = this.options.shutdown;
    if (shutdown?.aborted === true) this.interrupt({ kind: 'shutdown' });
    else shutdown?.addEventListener('abort', this.onShutdown, { once: true });
    const { timeoutMs } = this.options;
    this.timeout = setTimeout(() => this.interrupt({ kind: 'timeout', timeoutMs }), timeoutMs);
    this.watcher = setInterval(() => {
      void this.watch();
    }, STEP_WATCH_INTERVAL_MS);
    return this;
  }

  /** Stops the timers. A watch failure other than an unreadable run file is raised here, never dropped. */
  close(): void {
    this.closed = true;
    if (this.timeout !== null) clearTimeout(this.timeout);
    if (this.watcher !== null) clearInterval(this.watcher);
    this.options.active.signal.removeEventListener('abort', this.onRunAbort);
    this.options.shutdown?.removeEventListener('abort', this.onShutdown);
    if (this.unexpected !== null) throw new StepWatchError({ cause: this.unexpected });
  }

  private interrupt(interruption: StepInterruption): void {
    if (this.interruptionValue !== null) return;
    this.interruptionValue = interruption;
    this.controller.abort(new StepInterruptedError(interruption.kind));
  }

  private async watch(): Promise<void> {
    if (this.inspecting || this.closed || this.interruptionValue !== null) return;
    this.inspecting = true;
    try {
      await this.inspect();
    } catch (error) {
      // An unreadable control.json or cost.json is raised by the between-steps read that follows.
      if (!(error instanceof RunFileError)) this.unexpected ??= error;
    } finally {
      this.inspecting = false;
    }
  }

  private async inspect(): Promise<void> {
    const { active, control } = this.options;
    const state = await control.read(active.runDir);
    if (this.closed) return;
    if (state.directive.kind === 'stop') {
      await active.acknowledgeControl('stop');
      this.interrupt({ kind: 'stop', reason: state.directive.reason });
      return;
    }
    this.showPauseNotice(state.directive.kind === 'pause');
    if (state.directive.kind === 'pause') await active.acknowledgeControl('pause');

    const spentUsd = await liveRunSpendUsd(active.runDir);
    const limitUsd = active.snapshot.limits.costPerRunUsd;
    if (!this.closed && spentUsd > limitUsd) this.interrupt({ kind: 'cost-ceiling', spentUsd, limitUsd });
  }

  /** The step keeps running on `pause`; the owner sees the request is taken (criterion 14). */
  private showPauseNotice(pauseRequested: boolean): void {
    if (pauseRequested === this.pauseNoticeShown) return;
    this.pauseNoticeShown = pauseRequested;
    this.options.active.setNotice(pauseRequested ? ownerTexts.pauseRequested : null);
  }
}
