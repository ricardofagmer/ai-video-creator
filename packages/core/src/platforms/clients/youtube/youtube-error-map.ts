import { z } from 'zod';
import { type PlatformClientErrorReason, type PlatformClientOperation } from '../platform-client.errors';

/*
 * How a YouTube error answer becomes a reason id (SPEC 0007 sections 5.2, 5.7, K7, K10). Only the
 * machine-readable `reason` / `error` codes are read, through strict schemas; the human `message`
 * and `error_description` are accepted by the schema and never read, so no platform text survives.
 */

const shortCode = z.string().max(200);

/** One entry of a Data or Analytics API error's `errors[]` (Google JSON error format). */
const GoogleErrorItemSchema = z
  .object({
    message: shortCode.optional(),
    domain: shortCode.optional(),
    reason: shortCode.optional(),
    location: shortCode.optional(),
    locationType: shortCode.optional(),
    extendedHelp: shortCode.optional(),
    debugInfo: shortCode.optional(),
  })
  .strict();

/** `{ error: { code, message, errors[], status, details } }`; `details` is never read. */
const GoogleApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.number().int().optional(),
        message: z.string().max(4_000).optional(),
        status: shortCode.optional(),
        errors: z.array(GoogleErrorItemSchema).max(20).optional(),
        details: z.array(z.unknown()).max(20).optional(),
      })
      .strict(),
  })
  .strict();

/** OAuth endpoints ([G1]): `{ error: "invalid_grant", error_description }`. */
const GoogleOAuthErrorSchema = z
  .object({
    error: shortCode,
    error_description: z.string().max(4_000).optional(),
    error_uri: z.string().max(400).optional(),
  })
  .strict();

/** The machine codes of an error body, or an empty list when the body is not a known shape. */
export function googleErrorCodes(body: unknown): string[] {
  const api = GoogleApiErrorSchema.safeParse(body);
  if (api.success) {
    const codes = (api.data.error.errors ?? []).flatMap((item) => (item.reason === undefined ? [] : [item.reason]));
    if (api.data.error.status !== undefined) codes.push(api.data.error.status);
    return codes;
  }
  const oauth = GoogleOAuthErrorSchema.safeParse(body);
  return oauth.success ? [oauth.data.error] : [];
}

/** Data and Analytics API reason codes ([G2] error table, Google's standard reasons). */
const dataReasonOf: Readonly<Record<string, PlatformClientErrorReason>> = Object.freeze({
  quotaExceeded: 'quota-exhausted',
  dailyLimitExceeded: 'quota-exhausted',
  uploadLimitExceeded: 'quota-exhausted',
  rateLimitExceeded: 'rate-limited',
  userRateLimitExceeded: 'rate-limited',
  RESOURCE_EXHAUSTED: 'rate-limited',
  insufficientPermissions: 'scope-missing',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: 'scope-missing',
  authError: 'token-revoked',
  UNAUTHENTICATED: 'token-revoked',
  youtubeSignupRequired: 'account-not-eligible',
  accessNotConfigured: 'account-not-eligible',
  invalidTitle: 'metadata-rejected',
  invalidDescription: 'metadata-rejected',
  invalidTags: 'metadata-rejected',
  invalidVideoMetadata: 'metadata-rejected',
  invalidCategoryId: 'metadata-rejected',
  defaultLanguageNotSet: 'metadata-rejected',
  forbiddenPrivacySetting: 'metadata-rejected',
  forbiddenLicenseSetting: 'metadata-rejected',
  mediaBodyRequired: 'media-rejected',
  invalidFilename: 'media-rejected',
  backendError: 'platform-unavailable',
});

/** Codes checked first: a quota or rate answer wins over any other code in the same body. */
const precedence: readonly PlatformClientErrorReason[] = ['quota-exhausted', 'rate-limited', 'token-revoked', 'scope-missing'];

function reasonFromCodes(codes: readonly string[]): PlatformClientErrorReason | null {
  const reasons = codes.flatMap((code) => {
    const reason = dataReasonOf[code];
    return reason === undefined ? [] : [reason];
  });
  return precedence.find((reason) => reasons.includes(reason)) ?? reasons[0] ?? null;
}

/** What a status means when the body names no known code, per operation. */
function reasonFromStatus(status: number, operation: PlatformClientOperation): PlatformClientErrorReason {
  if (status === 401) return 'token-revoked';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'platform-unavailable';
  if (operation === 'upload' && status === 400) return 'metadata-rejected';
  if (operation === 'upload' && status === 403) return 'policy-rejected';
  return 'invalid-response';
}

/** A Data, Analytics or upload error answer as a reason id. */
export function dataErrorReason(status: number, body: unknown, operation: PlatformClientOperation): PlatformClientErrorReason {
  if (status === 401) return 'token-revoked';
  return reasonFromCodes(googleErrorCodes(body)) ?? reasonFromStatus(status, operation);
}

/** True when an Analytics answer says the video is not this channel's (a plain `forbidden`). */
export function isForbiddenOnly(status: number, body: unknown): boolean {
  if (status !== 403) return false;
  const codes = googleErrorCodes(body);
  return codes.includes('forbidden') && reasonFromCodes(codes) === null;
}

/**
 * An OAuth token-endpoint error as a reason id ([G1]). `invalid_grant` on an exchange is a refused
 * code; on a refresh it means the grant is gone: `refresh-expired` when the bundle said it would
 * expire by now, else `token-revoked` (Google uses one code for both).
 */
export function oauthErrorReason(options: {
  status: number;
  body: unknown;
  operation: 'exchange' | 'refresh';
  refreshExpired: boolean;
}): PlatformClientErrorReason {
  const { status, operation } = options;
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'platform-unavailable';
  const codes = googleErrorCodes(options.body);
  if (codes.includes('access_denied')) return 'denied';
  if (codes.includes('invalid_scope')) return 'scope-missing';
  if (operation === 'exchange') return 'exchange-failed';
  if (codes.includes('invalid_grant')) return options.refreshExpired ? 'refresh-expired' : 'token-revoked';
  // `invalid_client` / `unauthorized_client`: the app credential no longer works for this grant.
  return 'token-revoked';
}
