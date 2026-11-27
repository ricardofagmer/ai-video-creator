import { ApiError } from '../platform/api.errors';

/**
 * Pair refused (wrong, expired, used, locked or throttled code, or a malformed body) or status
 * asked without a valid token. One error for every case, answered 401 with no body by
 * `InstallRefusalFilter`, so the answer tells nothing about which check failed (DI-AC-10).
 */
export class InstallUnauthorizedError extends ApiError {
  readonly statusCode = 401;
  readonly code = 'auth';

  constructor() {
    super('Not authorized for the install routes');
    this.name = 'InstallUnauthorizedError';
  }
}

/**
 * This build runs on a platform C1 has no value for (only `darwin-arm64` and `win32-x64`). C1 rev 2
 * answers 503 with an empty body (`InstallRefusalFilter`); the platform list stays closed.
 */
export class InstallPlatformUnsupportedError extends ApiError {
  readonly statusCode = 503;
  readonly code = 'dependency';

  constructor() {
    super('This platform is not covered by the install contract');
    this.name = 'InstallPlatformUnsupportedError';
  }
}

/** Neither the payload manifest nor the api package names a usable semantic version. */
export class InstallVersionUnavailableError extends ApiError {
  readonly statusCode = 500;
  readonly code = 'internal';

  constructor() {
    super('The installed version could not be read');
    this.name = 'InstallVersionUnavailableError';
  }
}
