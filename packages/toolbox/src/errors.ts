/**
 * Toolbox error taxonomy. The CLI layer (cli/execute.ts) is the only place that
 * catches these and maps them to exit codes and run.json state changes:
 * - BlockedError (from @studio/shared/ace): exit 2, run moves to BLOCKED.
 * - InputError and subclasses: exit 1, run.json untouched (fix the input, re-run).
 * - anything else thrown inside a started stage: exit 1, run moves to FAILED.
 */

/** The caller's input or the run's preconditions are wrong; nothing was changed. */
export class InputError extends Error {
  constructor(
    message: string,
    readonly next?: string,
  ) {
    super(message);
    this.name = 'InputError';
  }
}

/** A required environment variable is missing or malformed. */
export class ConfigError extends InputError {
  constructor(message: string) {
    super(message, 'fill the missing values in .env at the repo root (see .env.example) and re-run');
    this.name = 'ConfigError';
  }
}

/** A manifest changed on disk after it was validated; downstream work would be stale. */
export class ManifestChangedError extends InputError {
  constructor(message: string, next: string) {
    super(message, next);
    this.name = 'ManifestChangedError';
  }
}

/** An external provider (ElevenLabs, Playwright) failed; the stage moves to FAILED. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** A local tool (ffmpeg, ffprobe) is missing or exited with an error. */
export class ExternalToolError extends Error {
  constructor(
    message: string,
    readonly tool: string,
  ) {
    super(message);
    this.name = 'ExternalToolError';
  }
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
