/**
 * Injection tokens and fixed settings of the launchd daemon (SPEC 0002 R1-09). Values are
 * constants rather than environment reads: the plist carries no configuration beyond PATH, and the
 * data home is resolved once by core `PathsModule`.
 */

/** `AbortSignal` that fires on SIGTERM/SIGINT; bound with `useValue` by the composition root. */
export const DAEMON_SHUTDOWN = Symbol('DAEMON_SHUTDOWN');

/** `{ pid }` of this daemon process, the `selfPid` of `watcher.pid` checks, as in `RunEngine`. */
export const DAEMON_PROCESS = Symbol('DAEMON_PROCESS');

export interface DaemonProcess {
  readonly pid: number;
}

/**
 * How often `runs/` is scanned when no run is executing. Criterion 14 allows 2 s from a `resume`
 * written by the web or CLI to the run continuing; one second leaves room for the claim itself.
 */
export const RUN_SCAN_INTERVAL_MS = 1000;

/**
 * Time between the first SIGTERM/SIGINT and a forced exit. The in-flight step's `AbortSignal`
 * fires at once through the engine's `WATCHER_SHUTDOWN` listener, and the engine then ends the
 * execution leaving the run `running`. 20 s covers a step that is slow to honour its signal, and
 * stays under the plist `ExitTimeOut` (30 s), after which launchd sends SIGKILL.
 */
export const SHUTDOWN_GRACE_MS = 20_000;

/**
 * Consecutive unexpected failures of one run before the daemon stops picking it up until it
 * restarts. Without this bound a run whose files cannot be written would be crash-resumed on every
 * scan.
 */
export const MAX_CONSECUTIVE_RUN_FAILURES = 3;

/** Open asset jobs (reference analyses, voice samples) that end before a waiting run starts. */
export const MAX_ASSET_JOBS_BEFORE_RUN = 4;

/**
 * Least time between two heartbeat write-failure warnings (SPEC 0002 rev 4, section 13.3). One
 * warning per outage already; this bounds a write that fails and recovers on alternate beats.
 */
export const HEARTBEAT_WARNING_MIN_GAP_MS = 60_000;

/** pino JSON lines, one file under `<data home>/logs/`. */
export const DAEMON_LOG_FILE_NAME = 'watcher.log';

/** Owner-only log file: lines are redacted, yet they still name run ids and local paths. */
export const DAEMON_LOG_FILE_MODE = 0o600;
