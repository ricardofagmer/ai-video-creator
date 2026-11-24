/**
 * Injection tokens of the watcher's asset-job step (docs/specs/2026-11-23-guided-creation-design.md
 * sections 2 and 4). Bound by `WatcherAssetJobsModule.register`; the daemon root passes its
 * shutdown signal in, exactly as for curations.
 */

/** `AbortSignal` that fires on SIGTERM/SIGINT: the same signal the daemon loop watches. */
export const ASSET_JOBS_STOP = Symbol('ASSET_JOBS_STOP');

/** `{ pid }` of this daemon process, written into `job.json` `claim.pid`. */
export const ASSET_JOBS_PROCESS = Symbol('ASSET_JOBS_PROCESS');

/** `Clock` of the asset-job step (rules/architecture.md: inject the clock). */
export const ASSET_JOBS_CLOCK = Symbol('ASSET_JOBS_CLOCK');

/** C6 `ReferenceAnalystPort`, bound to core `REFERENCE_ANALYST_PORT` (catalog selection with core agents only). */
export const REFERENCE_ANALYST = Symbol('REFERENCE_ANALYST');

/** C6 `AssetJobCostPort`, bound to core `AssetJobCostService`. */
export const ASSET_JOB_COST = Symbol('ASSET_JOB_COST');

/** C6 `ReferenceAnalysisReaderPort`, bound to core `ReferenceAnalysisReader`; read by the `script` stage. */
export const REFERENCE_ANALYSIS_READER = Symbol('REFERENCE_ANALYSIS_READER');

export interface AssetJobProcess {
  readonly pid: number;
}

/**
 * Consecutive unexpected claim failures of one job before the step stops picking it up and ends it
 * `failed` / `claimant-gone`; without it, an unwritable folder would be retried on every idle tick.
 */
export const MAX_CONSECUTIVE_ASSET_JOB_CLAIM_FAILURES = 3;
