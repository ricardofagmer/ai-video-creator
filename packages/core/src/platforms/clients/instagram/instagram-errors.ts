import { type PlatformClientErrorReason, type PlatformClientOperation } from '../platform-client.errors';

/*
 * Instagram answers mapped to the closed reason ids (SPEC 0007 sections 5.2 and 5.7). Only the HTTP
 * status, the numeric Graph `code`, its `error_subcode` and a parsed `Retry-After` are kept; the
 * platform's text never leaves the transport (K7, K10). The Graph codes are the Graph API's general
 * error codes: [M2] to [M4] list none for Instagram Login, so they are confirmed by the AC 63 run.
 */

/** What the transport keeps from a failed answer. */
export interface InstagramHttpFailure {
  httpStatus: number;
  code: number | null;
  subcode: number | null;
  retryAfterSeconds: number | null;
}

/** App, user, page and hourly call limits: a short wait (section 5.7 backoff steps). */
const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([4, 17, 32, 613]);

/** The Instagram business use case ceiling (4800 x impressions per 24 h [M4]): wait for the window. */
const QUOTA_CODES: ReadonlySet<number> = new Set([80002]);

/** Invalid, expired or revoked user token; the watcher then tries one refresh (section 5.2). */
const TOKEN_CODES: ReadonlySet<number> = new Set([102, 190]);

/** Graph's unknown and service errors. */
const UNAVAILABLE_CODES: ReadonlySet<number> = new Set([1, 2]);

/** Code 190 subcode for an expired token: on a refresh it means the 60 days passed unrefreshed [M2]. */
const EXPIRED_TOKEN_SUBCODE = 463;

/** Code 100 is Graph's generic invalid-parameter error; only its subcode 33 means the object is gone. */
const GRAPH_INVALID_PARAMETER_CODE = 100;
const OBJECT_NOT_FOUND_SUBCODE = 33;

/**
 * True when a media read failed because the object does not exist or cannot be read by this
 * account. Any other code 100 (a bad metric name, a malformed field) is a client fault, not a
 * deleted post, so it must not count toward the watcher's three not-found strikes.
 */
export function isObjectNotFound(failure: InstagramHttpFailure): boolean {
  return failure.httpStatus < 500 && failure.code === GRAPH_INVALID_PARAMETER_CODE && failure.subcode === OBJECT_NOT_FOUND_SUBCODE;
}

function isPermissionCode(code: number): boolean {
  return code === 10 || (code >= 200 && code <= 299);
}

function tokenReason(operation: PlatformClientOperation, failure: InstagramHttpFailure): PlatformClientErrorReason {
  if (operation !== 'refresh') return 'token-revoked';
  return failure.subcode === EXPIRED_TOKEN_SUBCODE ? 'refresh-expired' : 'token-revoked';
}

/** The reason id for one failed Instagram answer; first match wins. */
export function reasonForFailure(operation: PlatformClientOperation, failure: InstagramHttpFailure): PlatformClientErrorReason {
  const { code, httpStatus } = failure;
  if (httpStatus === 429 || (code !== null && RATE_LIMIT_CODES.has(code))) return 'rate-limited';
  if (code !== null && QUOTA_CODES.has(code)) return 'quota-exhausted';
  // Any other refusal of the code or the long-lived exchange is one outcome for the callback.
  if (operation === 'exchange') return 'exchange-failed';
  if (httpStatus === 401 || (code !== null && TOKEN_CODES.has(code))) return tokenReason(operation, failure);
  if (httpStatus === 403 || (code !== null && isPermissionCode(code))) return 'scope-missing';
  if (httpStatus >= 500 || (code !== null && UNAVAILABLE_CODES.has(code))) return 'platform-unavailable';
  if (operation === 'refresh') return 'refresh-expired';
  return 'invalid-response';
}
