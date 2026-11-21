/*
 * Errors of the HyperFrames runtime (SPEC 0008 K12). Each carries a reason id and, for a process
 * that ran, its exit code. Messages never hold a path, a variable value or child output: they can
 * reach logs and run files.
 */

export type HyperframesRuntimeFailure =
  | 'pin-mismatch'
  | 'sandbox-unavailable'
  | 'chrome-missing'
  | 'process-start-failed'
  | 'render-failed'
  | 'browser-ensure-failed';

export class HyperframesRuntimeError extends Error {
  constructor(
    readonly reason: HyperframesRuntimeFailure,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export type PinMismatchDetail = 'not-installed' | 'outside-workspace' | 'manifest-unreadable' | 'other-version';

/** The package under `node_modules/hyperframes` is not the approved pin; nothing was started. */
export class HyperframesPinMismatchError extends HyperframesRuntimeError {
  constructor(readonly detail: PinMismatchDetail) {
    super('pin-mismatch', `hyperframes is not the approved version (${detail})`);
  }
}

/**
 * `/usr/bin/sandbox-exec` is missing, or the isolation cannot be configured (a sandbox parameter
 * that is not an absolute path, holds a NUL or a line break, a port out of range, or an executable
 * that cannot be found): a render never starts unsandboxed (SPEC 0008 section 17.5).
 */
export class HyperframesSandboxUnavailableError extends HyperframesRuntimeError {
  constructor() {
    super('sandbox-unavailable', 'the macOS sandbox is not available');
  }
}

export type ChromeMissingDetail = 'none' | 'several' | 'other-version' | 'unreadable' | 'changed';

/**
 * The pinned `chrome-headless-shell` was not found exactly once in the studio cache (U3), or the
 * recorded binary no longer matches its path, size or sha-256 (`changed`, SPEC 0008 section 17.6).
 */
export class HyperframesChromeMissingError extends HyperframesRuntimeError {
  constructor(readonly detail: ChromeMissingDetail) {
    super('chrome-missing', `the pinned chrome-headless-shell was not found (${detail})`);
  }
}

/** The child could not be started at all (for example the executable is missing). */
export class HyperframesProcessStartError extends HyperframesRuntimeError {
  constructor(readonly code: string) {
    super('process-start-failed', `the HyperFrames process did not start (${code})`);
  }
}

/** The child ran and ended with a non-zero exit code. Its stderr stayed on the parent's stderr. */
export class HyperframesProcessFailedError extends HyperframesRuntimeError {
  constructor(
    reason: 'render-failed' | 'browser-ensure-failed',
    readonly exitCode: number,
  ) {
    super(reason, `${reason} (exit ${exitCode})`);
  }
}
