import { type Platform } from '@studio/shared/platforms';

/**
 * Why a platform call failed, as a closed set of ids (SPEC 0007 sections 5.2, 5.4, 5.7). A client
 * maps every HTTP status, error body and transport failure to one of these and drops the
 * platform's own text, so nothing a platform says reaches a log, a file or a response (K7, K10).
 */
export type PlatformClientErrorReason =
  | 'denied'
  | 'exchange-failed'
  | 'scope-missing'
  | 'token-revoked'
  | 'refresh-expired'
  | 'rate-limited'
  | 'quota-exhausted'
  | 'platform-unavailable'
  | 'network'
  | 'media-rejected'
  | 'metadata-rejected'
  | 'policy-rejected'
  | 'account-not-eligible'
  | 'outcome-unknown'
  | 'invalid-response';

/** The operation that failed, for the log line. */
export type PlatformClientOperation =
  | 'authorize-url'
  | 'exchange'
  | 'identity'
  | 'refresh'
  | 'revoke'
  | 'upload'
  | 'upload-status'
  | 'metrics';

/**
 * A failed platform call. `transport` marks a connection error a resumable upload may resume
 * (B9: at most 3 times); `retryAfterSeconds` carries a parsed `Retry-After` (section 5.7).
 */
export class PlatformClientError extends Error {
  readonly category = 'dependency';

  constructor(
    readonly platform: Platform,
    readonly operation: PlatformClientOperation,
    readonly reason: PlatformClientErrorReason,
    readonly details: { transport: boolean; retryAfterSeconds: number | null } = { transport: false, retryAfterSeconds: null },
  ) {
    super(`The ${platform} ${operation} call failed (${reason})`);
    this.name = 'PlatformClientError';
  }
}
