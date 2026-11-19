import { type ApiErrorCode, type ApiIssue } from '@studio/shared/api';

/**
 * Typed errors raised by the api itself (core modules raise their own). Each carries its HTTP
 * mapping; messages never contain paths, request values or secrets.
 */
export abstract class ApiError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ApiErrorCode;
}

export class RequestValidationError extends ApiError {
  readonly statusCode = 400;
  readonly code = 'validation';

  constructor(readonly issues: readonly ApiIssue[]) {
    super('The request does not match the api contract');
    this.name = 'RequestValidationError';
  }
}

export class UnauthenticatedError extends ApiError {
  readonly statusCode = 401;
  readonly code = 'auth';

  constructor() {
    super('A valid session is required');
    this.name = 'UnauthenticatedError';
  }
}

export class InvalidPassphraseError extends ApiError {
  readonly statusCode = 401;
  readonly code = 'auth';

  constructor() {
    super('The passphrase is not correct');
    this.name = 'InvalidPassphraseError';
  }
}

/** No hash row yet: the install script (R1-22) sets the passphrase. */
export class PassphraseNotConfiguredError extends ApiError {
  readonly statusCode = 503;
  readonly code = 'dependency';

  constructor() {
    super('No passphrase is configured; set it with the install script');
    this.name = 'PassphraseNotConfiguredError';
  }
}

/** The stored row is not an argon2id hash; login fails closed instead of trying another scheme. */
export class PassphraseHashInvalidError extends ApiError {
  readonly statusCode = 500;
  readonly code = 'internal';

  constructor() {
    super('The stored passphrase hash is not usable');
    this.name = 'PassphraseHashInvalidError';
  }
}

export class LoginRateLimitedError extends ApiError {
  readonly statusCode = 429;
  readonly code = 'rate_limited';

  constructor(readonly retryAfterSeconds: number) {
    super('Too many login attempts; wait before trying again');
    this.name = 'LoginRateLimitedError';
  }
}

export type UploadRejection =
  | 'not-multipart'
  | 'missing-fields'
  | 'invalid-fields'
  | 'unexpected-part'
  | 'missing-file'
  | 'too-many-parts'
  | 'field-too-large'
  | 'file-too-large'
  | 'invalid-file-path'
  | 'duplicate-file'
  | 'malformed';

const TOO_LARGE: readonly UploadRejection[] = ['file-too-large'];

export class UploadRejectedError extends ApiError {
  readonly statusCode: number;
  readonly code = 'validation';

  constructor(readonly rejection: UploadRejection) {
    super(`Upload refused: ${rejection}`);
    this.name = 'UploadRejectedError';
    this.statusCode = TOO_LARGE.includes(rejection) ? 413 : 400;
  }
}

/**
 * C10 rev 5 413 `metrics-file-too-large` (SPEC 0006 section 5.3, receive stage): the CSV part, or
 * the declared body, is over 2 MiB. Raised while receiving, before any byte reaches core; the
 * name gives the reason, and the message carries no file name.
 */
export class MetricsFileTooLargeError extends ApiError {
  readonly statusCode = 413;
  readonly code = 'validation';

  constructor() {
    super('The metrics file is larger than 2 MiB');
    this.name = 'MetricsFileTooLargeError';
  }
}

/**
 * An answer core produced does not match the frozen C10 schema of its route. Refused instead of
 * sent, so no unvetted field (a cell, a URL fragment) can leave the api; the detail stays server-side.
 */
export class ResponseContractViolationError extends ApiError {
  readonly statusCode = 500;
  readonly code = 'internal';

  constructor(readonly view: string) {
    super('The answer does not match the api contract');
    this.name = 'ResponseContractViolationError';
  }
}

/** Unknown, not allowlisted, outside the run folder or not a regular file: all read as absent. */
export class ArtifactNotFoundError extends ApiError {
  readonly statusCode = 404;
  readonly code = 'not_found';

  constructor() {
    super('No such run artifact');
    this.name = 'ArtifactNotFoundError';
  }
}

export class RangeNotSatisfiableError extends ApiError {
  readonly statusCode = 416;
  readonly code = 'validation';

  constructor() {
    super('The requested byte range is not satisfiable');
    this.name = 'RangeNotSatisfiableError';
  }
}

/**
 * A by-reference path refused at steps 2 to 6 of SPEC 0002 rev 4, section 13.4 (A24). One reason,
 * `reference-path-refused`, for every step, so the answer tells nothing about which check failed;
 * the message never carries the path.
 */
export class ReferencePathRefusedError extends ApiError {
  readonly statusCode = 422;
  readonly code = 'validation';

  constructor() {
    super('The reference path is not allowed');
    this.name = 'ReferencePathRefusedError';
  }
}

/** A by-reference file sent without `mimeType` whose extension `mimeTypeForFileName` does not know (A23). */
export class ReferenceMimeTypeUnknownError extends ApiError {
  readonly statusCode = 422;
  readonly code = 'validation';

  constructor() {
    super('The file type of the reference is not known; send mimeType');
    this.name = 'ReferenceMimeTypeUnknownError';
  }
}

/**
 * Core's inspection of a by-reference target failed with an untyped error (an errno error names the
 * path in its message). Replaced by this path-free error so neither the response nor the log of an
 * unexpected failure can carry the path.
 */
export class ReferenceRegistrationFailedError extends ApiError {
  readonly statusCode = 500;
  readonly code = 'internal';

  constructor() {
    super('The reference could not be registered');
    this.name = 'ReferenceRegistrationFailedError';
  }
}

/**
 * The promotion command answered for another target kind than the route asked for. Cannot happen
 * with the core handler of rev 3; refused as an internal error instead of returning a wrong view.
 */
export class PromotionResultMismatchError extends ApiError {
  readonly statusCode = 500;
  readonly code = 'internal';

  constructor() {
    super('The promotion result does not match the route');
    this.name = 'PromotionResultMismatchError';
  }
}

/**
 * A write that must record its correlation id ran outside the request context
 * `CorrelationMiddleware` opens. Cannot happen for a routed request; refused instead of
 * inventing an id the client never saw (SPEC 0005 section 6).
 */
export class CorrelationIdMissingError extends ApiError {
  readonly statusCode = 500;
  readonly code = 'internal';

  constructor() {
    super('The request has no correlation id');
    this.name = 'CorrelationIdMissingError';
  }
}
