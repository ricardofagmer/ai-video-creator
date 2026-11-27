/*
 * First-run setup (plan section 5, rev 3 section 9): the shared vocabulary of the orchestrator, the
 * nine steps and the setup window. Every state is a discriminated union; nothing here carries a
 * path, a passphrase or command output, so a report can be logged or sent to the window as is.
 */

/** The nine ordered steps of plan section 5. Step 0 (app location) is not a step: it gates them all. */
export const SETUP_STEP_IDS = [
  'verify-payload',
  'data-folders',
  'migrations',
  'passphrase',
  'optional-downloads',
  'watcher-agent',
  'seed-catalog',
  'start-services',
  'doctor',
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

/** Why a step could not finish. Reason ids only: the window maps each to a translated sentence. */
export type StepFailureReason =
  | 'manifest-missing'
  | 'manifest-invalid'
  | 'payload-version-mismatch'
  | 'payload-damaged'
  | 'data-home-parent-missing'
  | 'data-home-not-a-folder'
  | 'migrations-failed'
  /** Step 3 left the database untouched: something still listens on the API port. */
  | 'api-still-running'
  /** Step 3 left the database untouched: another process still has the database file open. */
  | 'database-in-use'
  | 'passphrase-cancelled'
  | 'passphrase-refused'
  | 'plist-invalid'
  | 'agent-not-loaded'
  | 'seed-failed'
  | 'seed-partial'
  | 'services-failed'
  | 'doctor-unhealthy'
  | 'download-failed'
  | 'offer-unavailable'
  | 'process-failed'
  | 'unexpected-error';

export type StepCheck = { readonly kind: 'done' } | { readonly kind: 'needed' };

export type StepRunResult =
  | { readonly kind: 'done' }
  /** Finished with a caveat (an optional component left out, a partial seed); setup continues. */
  | { readonly kind: 'warning'; readonly reason: StepFailureReason }
  | { readonly kind: 'failed'; readonly reason: StepFailureReason };

/**
 * One idempotent unit. `check` derives its answer from the machine (files, launchd, the CLI) and
 * changes nothing; `run` is only called when `check` answered `needed`.
 */
export interface SetupStep {
  readonly id: SetupStepId;
  /** A required step that fails stops setup; an optional one warns and setup continues. */
  readonly required: boolean;
  check(): Promise<StepCheck>;
  run(): Promise<StepRunResult>;
}

export type StepReport =
  | { readonly id: SetupStepId; readonly status: 'pending' }
  | { readonly id: SetupStepId; readonly status: 'checking' }
  | { readonly id: SetupStepId; readonly status: 'running' }
  | { readonly id: SetupStepId; readonly status: 'waiting-for-user' }
  | { readonly id: SetupStepId; readonly status: 'already-done' }
  | { readonly id: SetupStepId; readonly status: 'done' }
  | { readonly id: SetupStepId; readonly status: 'warning'; readonly reason: StepFailureReason }
  | { readonly id: SetupStepId; readonly status: 'failed'; readonly reason: StepFailureReason };

/** Step 0 (DI-AC-24): why the app's own location cannot carry the absolute paths setup writes. */
export type AppLocationProblem = 'translocated' | 'disk-image';

export type OptionalComponentId = 'search-model' | 'capture-browser';

/** C1 vocabulary for the two optional components; `not-installed` is never an error (DI-AC-04). */
export type OptionalComponentState = 'installed' | 'not-installed';

export interface OptionalComponentsReport {
  readonly searchModel: OptionalComponentState;
  readonly captureBrowser: OptionalComponentState;
}

export type SetupProgress =
  | { readonly phase: 'refused'; readonly problem: AppLocationProblem }
  | { readonly phase: 'running'; readonly steps: readonly StepReport[] }
  | { readonly phase: 'complete'; readonly steps: readonly StepReport[]; readonly components: OptionalComponentsReport }
  | { readonly phase: 'failed'; readonly steps: readonly StepReport[]; readonly failedStep: SetupStepId; readonly reason: StepFailureReason };

/** What the user is shown before an optional download: where it comes from and how big it is. */
export interface DownloadOffer {
  readonly component: OptionalComponentId;
  /** Host name only (`huggingface.co`), never a full URL with a path or query. */
  readonly host: string;
  readonly sizeBytes: number;
}

export type ConsentAnswer = 'accepted' | 'declined';

/**
 * The passphrase as it crosses from the window to the CLI. A Buffer, not a string, so the caller can
 * overwrite it with zeros once it has been written to the child's stdin.
 */
export type PassphraseAnswer = { readonly kind: 'entered'; readonly secret: Buffer } | { readonly kind: 'cancelled' };

/** The steps that need the user ask through this port; the setup window implements it. */
export interface SetupInteraction {
  requestPassphrase(): Promise<PassphraseAnswer>;
  requestConsent(offer: DownloadOffer): Promise<ConsentAnswer>;
}

export type Clock = () => Date;
