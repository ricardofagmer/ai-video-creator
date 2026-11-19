/**
 * Injection tokens of the watcher's curation step (SPEC 0005 section 5.2). Bound by
 * `WatcherCurationModule.register`; the daemon root passes its shutdown signal in.
 */

/** `AbortSignal` that fires on SIGTERM/SIGINT: the same signal the daemon loop watches. */
export const CURATION_STOP = Symbol('CURATION_STOP');

/** `{ pid }` of this daemon process, written into `curation.json` `claim.pid`. */
export const CURATION_PROCESS = Symbol('CURATION_PROCESS');

/** `Clock` of the curation step (rules/architecture.md: inject the clock). */
export const CURATION_CLOCK = Symbol('CURATION_CLOCK');

/** C6 `CuratorPort`, bound to core `CuratorAgentService` (D17: the Curator boots in the watcher only). */
export const CURATOR = Symbol('CURATOR');

export interface CurationProcess {
  readonly pid: number;
}

/**
 * Consecutive unexpected claim failures of one curation before the step stops picking it up and
 * ends it `failed` / `internal-error`; without it, an unwritable folder would be retried on every
 * idle tick.
 */
export const MAX_CONSECUTIVE_CLAIM_FAILURES = 3;
