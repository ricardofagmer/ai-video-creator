import { SHUTDOWN_GRACE_MS } from './daemon.settings';

export type ForcedExitCause = { kind: 'second-signal'; signal: NodeJS.Signals } | { kind: 'grace-expired'; graceMs: number };

export interface ShutdownSignalsOptions {
  /** Called once when the graceful stop takes too long or a second signal arrives. */
  onForcedExit: (cause: ForcedExitCause) => void;
  /** Called once with the first signal, for logging. */
  onShutdownRequested: (signal: NodeJS.Signals) => void;
}

export interface ShutdownSignals {
  /** Aborts on the first SIGTERM or SIGINT; the daemon loop and `RUN_CONTROL` watch it. */
  readonly signal: AbortSignal;
  dispose(): void;
}

const handledSignals: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

/**
 * launchd stops the agent with SIGTERM (logout, `launchctl bootout`), then SIGKILL after the
 * plist `ExitTimeOut`. The first signal starts a graceful stop: the engine's `WATCHER_SHUTDOWN`
 * seam aborts the in-flight step's `AbortSignal` (and the child processes the executor ties to it)
 * and ends the execution with the run still `running`. A second signal, or the grace period running
 * out, forces the exit. Either way the next start finds `running` with no live `watcher.pid` and
 * crash-resumes from the same step (criterion 13); a shutdown is never recorded as `interrupted`.
 */
export function installShutdownSignals(options: ShutdownSignalsOptions): ShutdownSignals {
  const controller = new AbortController();
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let forced = false;

  const force = (cause: ForcedExitCause): void => {
    if (forced) return;
    forced = true;
    options.onForcedExit(cause);
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    if (controller.signal.aborted) {
      force({ kind: 'second-signal', signal });
      return;
    }
    controller.abort();
    options.onShutdownRequested(signal);
    graceTimer = setTimeout(() => force({ kind: 'grace-expired', graceMs: SHUTDOWN_GRACE_MS }), SHUTDOWN_GRACE_MS);
    // The timer must not keep a process alive that already finished its graceful stop.
    graceTimer.unref();
  };

  for (const signal of handledSignals) process.on(signal, onSignal);

  return {
    signal: controller.signal,
    dispose: (): void => {
      for (const signal of handledSignals) process.off(signal, onSignal);
      if (graceTimer !== null) clearTimeout(graceTimer);
    },
  };
}
