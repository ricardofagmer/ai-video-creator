/**
 * Optional engine seam (SPEC 0002 R1-09): an `AbortSignal` that fires when the watcher process
 * receives SIGTERM/SIGINT. Only the daemon composition binds it; unbound (dev fixture), the engine
 * never sees a shutdown.
 *
 * A shutdown is not an owner `stop`. The in-flight step is aborted through its `AbortSignal`, but
 * the run is left exactly as a crash leaves it: `running`, the step `running`, no `control.request`
 * event. The next watcher start finds a dead `watcher.pid` and resumes from that step (criterion 13).
 */
export const WATCHER_SHUTDOWN = Symbol('WATCHER_SHUTDOWN');

/** `log` event text (pt-BR, owner-facing like `owner-texts.ts`); C3 has no dedicated event type. */
export const watcherShutdownText =
  'O watcher está sendo encerrado: o passo em execução foi abortado e a execução continua do mesmo passo quando o watcher voltar.';
