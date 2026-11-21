import { type ApiRev7ErrorReason } from '@studio/shared/api';
import { type Platform } from '@studio/shared/platforms';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type PlatformErrorCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

/**
 * The `reason` of a platform refusal: a C10 rev 7 reason (SPEC 0007 section 4.4,
 * `apiRev7ErrorReasons`, whose status the api uses), malformed input, a platform file that no
 * longer matches its contract, or a request file the api could not write.
 */
export type PlatformErrorReason =
  | ApiRev7ErrorReason
  | 'invalid-platform-input'
  | 'platform-file-corrupt'
  | 'publish-request-write-failed'
  | 'platform-row-corrupt';

/**
 * Base of every platform domain error (SPEC 0007 K7). Messages and fields carry ids, platform
 * names, states and reason ids only: never a token, a code, a `state`, a verifier, a URL, a title,
 * a caption, a tag, an account label or a platform's own error text. `cause` is never set.
 */
export abstract class PlatformError extends Error {
  abstract readonly category: PlatformErrorCategory;
  abstract readonly reason: PlatformErrorReason;
}

/** Malformed command or query input; the issues carry paths and zod messages, never values. */
export class InvalidPlatformInputError extends PlatformError {
  override readonly category = 'validation';
  override readonly reason = 'invalid-platform-input';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid platform input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidPlatformInputError';
  }
}

/**
 * A refusal whose reason is one of the C10 rev 7 409/422/400/502/404 reasons. Nothing was written
 * (SPEC 0007 section 4.4). One class, so every refusal carries the same three fields.
 */
export class PlatformRefusedError extends PlatformError {
  override readonly category: PlatformErrorCategory;

  constructor(
    override readonly reason: Exclude<ApiRev7ErrorReason, 'keychain-unavailable' | 'publish-attempt-not-found'>,
    readonly platform: Platform | null,
    readonly subjectId: string | null = null,
  ) {
    super(`Platform request refused (${reason})${platform === null ? '' : ` for ${platform}`}${subjectId === null ? '' : ` on ${subjectId}`}`);
    this.name = 'PlatformRefusedError';
    this.category = reason === 'publish-visibility-not-allowed' || reason === 'oauth-state-invalid' ? 'validation' : 'conflict';
  }
}

/** 404 `publish-attempt-not-found`: no such attempt on that run. */
export class PublishAttemptNotFoundError extends PlatformError {
  override readonly category = 'not_found';
  override readonly reason = 'publish-attempt-not-found';

  constructor(
    readonly runId: string,
    readonly attemptId: string,
  ) {
    super(`Publish attempt ${attemptId} not found on run ${runId}`);
    this.name = 'PublishAttemptNotFoundError';
  }
}

/** Which vault operation failed; the failure is a fixed enum, never tool output. */
export type TokenVaultOperation = 'read' | 'write' | 'delete' | 'lock';
export type TokenVaultFailure =
  | 'unsupported-platform'
  | 'timeout'
  | 'command-failed'
  | 'output-too-large'
  | 'bundle-too-large'
  | 'command-too-long'
  | 'bundle-corrupt'
  | 'write-not-confirmed'
  | 'lock-held';

/** 503 `keychain-unavailable`: the platform token item could not be read, written or deleted. */
export class TokenVaultUnavailableError extends PlatformError {
  override readonly category = 'dependency';
  override readonly reason = 'keychain-unavailable';

  constructor(
    readonly platform: Platform,
    readonly operation: TokenVaultOperation,
    readonly failure: TokenVaultFailure,
    readonly exitCode: number | null = null,
  ) {
    super(`The ${platform} token vault could not ${operation} (${failure}${exitCode === null ? '' : `, exit ${exitCode}`})`);
    this.name = 'TokenVaultUnavailableError';
  }
}

/** A platform file under `<data home>/platform/` no longer matches its contract. */
export class PlatformFileCorruptError extends PlatformError {
  override readonly category = 'internal';
  override readonly reason = 'platform-file-corrupt';

  constructor(
    readonly file: 'gates.json' | 'account.json' | 'health.json' | 'state.json' | 'request.json' | 'cursor.json',
    readonly subjectId: string,
  ) {
    super(`The platform file ${file} (${subjectId}) does not match its contract`);
    this.name = 'PlatformFileCorruptError';
  }
}

/** A stored `publication_attempts` row no longer matches its contract. */
export class PlatformRowCorruptError extends PlatformError {
  override readonly category = 'internal';
  override readonly reason = 'platform-row-corrupt';

  constructor(readonly attemptId: string) {
    super(`A publication_attempts row (${attemptId}) does not match its contract`);
    this.name = 'PlatformRowCorruptError';
  }
}

/**
 * `RequestPublish` step 9 failed: the row is already set to `failed` / `internal-error`, so no
 * upload can follow (SPEC 0007 section 5.4).
 */
export class PublishRequestWriteFailedError extends PlatformError {
  override readonly category = 'internal';
  override readonly reason = 'publish-request-write-failed';

  constructor(
    readonly runId: string,
    readonly attemptId: string,
  ) {
    super(`The publish request file of attempt ${attemptId} (run ${runId}) could not be written`);
    this.name = 'PublishRequestWriteFailedError';
  }
}
