import { PlatformClientError, type PlatformClientErrorReason } from '@studio/core/platforms';
import { type PollBackoffReason, type PublishFailureReason } from '@studio/shared/platforms';
import { type TokenBlockedReason } from './platform-token.session';

/*
 * How the watcher reads a failed platform call (SPEC 0007 sections 5.2, 5.5 and 5.7). Pure: a
 * `PlatformClientError` carries a closed reason id, never the platform's text (K7, K10).
 */

/** How an upload or a status check ended when the platform call failed. */
export type UploadFailureVerdict = { state: 'failed'; reasonId: PublishFailureReason } | { state: 'outcome-unknown' };

const publishReasonOf: Readonly<Record<PlatformClientErrorReason, PublishFailureReason | 'outcome-unknown'>> = {
  denied: 'token-revoked',
  'exchange-failed': 'token-revoked',
  'token-revoked': 'token-revoked',
  'refresh-expired': 'token-revoked',
  'scope-missing': 'scope-missing',
  'rate-limited': 'rate-limited',
  'quota-exhausted': 'quota-exhausted',
  'platform-unavailable': 'platform-unavailable',
  network: 'network',
  'media-rejected': 'media-rejected',
  'metadata-rejected': 'metadata-rejected',
  'policy-rejected': 'policy-rejected',
  'account-not-eligible': 'account-not-eligible',
  // The connection dropped after the last byte, or the answer could not be read: the video may exist.
  'outcome-unknown': 'outcome-unknown',
  'invalid-response': 'outcome-unknown',
};

/**
 * Section 5.7: a 429 or a quota answer fails the attempt with its reason and is never retried; the
 * owner clicks again. Anything that is not a platform error is `internal-error`.
 */
export function uploadFailureVerdict(error: unknown): UploadFailureVerdict {
  if (!(error instanceof PlatformClientError)) return { state: 'failed', reasonId: 'internal-error' };
  const reason = publishReasonOf[error.reason];
  return reason === 'outcome-unknown' ? { state: 'outcome-unknown' } : { state: 'failed', reasonId: reason };
}

/** A 401 or `invalid_grant`: the call that got it triggers exactly one refresh (section 5.2). */
export function isTokenRejection(error: unknown): boolean {
  return error instanceof PlatformClientError && (error.reason === 'token-revoked' || error.reason === 'denied');
}

const backoffReasonOf: Readonly<Partial<Record<PlatformClientErrorReason, PollBackoffReason>>> = {
  'rate-limited': 'rate-limited',
  'quota-exhausted': 'quota-exhausted',
  'platform-unavailable': 'platform-unavailable',
  network: 'network',
};

/** The poll backoff a failed call starts (section 5.7), with a parsed `Retry-After`; null when none applies. */
export function pollBackoffOf(error: unknown): { reasonId: PollBackoffReason; retryAfterSeconds: number | null } | null {
  if (!(error instanceof PlatformClientError)) return null;
  const reasonId = backoffReasonOf[error.reason];
  return reasonId === undefined ? null : { reasonId, retryAfterSeconds: error.details.retryAfterSeconds };
}

/** The failure reason of an attempt whose token could not be obtained; an unreadable `health.json` is a platform file that no longer parses. */
export function publishReasonOfBlockedToken(reasonId: TokenBlockedReason): PublishFailureReason {
  if (reasonId === 'needs-reconnect') return 'token-revoked';
  return reasonId === 'health-unknown' ? 'internal-error' : 'account-not-connected';
}

/** A reason id safe for a log line: the client's closed id, or null. */
export function clientReasonOf(error: unknown): PlatformClientErrorReason | null {
  return error instanceof PlatformClientError ? error.reason : null;
}
