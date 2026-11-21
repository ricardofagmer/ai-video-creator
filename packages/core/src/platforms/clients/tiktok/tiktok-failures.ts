import { type PublishFailureReason } from '@studio/shared/platforms';
import { type z } from 'zod';
import { PlatformClientError, type PlatformClientErrorReason, type PlatformClientOperation } from '../platform-client.errors';
import { parseJsonText, type TiktokAnswer } from './tiktok-http';
import { ApiFailureSchema, OAuthErrorSchema } from './tiktok-schemas';

/*
 * TikTok failures as closed reason ids (SPEC 0007 sections 5.2, 5.4, 5.7). TikTok's code is read,
 * mapped and dropped with the rest of its body (K7, K10). Lookups use `Map` so a code such as
 * `constructor` can never hit an object prototype.
 */

/** A reason both an attempt's `failed` state and a `PlatformClientError` can carry. */
export type TiktokFailReason = Extract<PublishFailureReason, PlatformClientErrorReason>;

/** Content Posting and Display API `error.code` values [T4][T6][T7][T8]. */
const apiCodeReasons = new Map<string, PlatformClientErrorReason>([
  ['access_token_invalid', 'token-revoked'],
  ['scope_not_authorized', 'scope-missing'],
  ['rate_limit_exceeded', 'rate-limited'],
  // At most 5 pending inbox shares per 24 h [T4]: a daily cap, not a per-minute limit.
  ['spam_risk_too_many_pending_share', 'quota-exhausted'],
  ['spam_risk_too_many_posts', 'quota-exhausted'],
  ['spam_risk_user_banned_from_posting', 'account-not-eligible'],
  ['url_ownership_unverified', 'policy-rejected'],
  ['spam_risk', 'policy-rejected'],
  ['spam_risk_text', 'metadata-rejected'],
  // The status call cannot see the upload: whether the video exists is unknown.
  ['invalid_publish_id', 'outcome-unknown'],
  ['token_not_authorized_for_specified_publish_id', 'outcome-unknown'],
  ['internal_error', 'platform-unavailable'],
]);

/** `fail_reason` of a `FAILED` post status [T8]. */
const failReasons = new Map<string, TiktokFailReason>([
  ['file_format_check_failed', 'media-rejected'],
  ['duration_check_failed', 'media-rejected'],
  ['frame_rate_check_failed', 'media-rejected'],
  ['picture_size_check_failed', 'media-rejected'],
  ['video_pull_failed', 'media-rejected'],
  ['photo_pull_failed', 'media-rejected'],
  ['internal', 'platform-unavailable'],
  // The studio never cancels a TikTok post, so a cancel is TikTok's own doing.
  ['publish_cancelled', 'platform-unavailable'],
  ['auth_removed', 'token-revoked'],
  ['spam_risk_too_many_posts', 'quota-exhausted'],
  ['spam_risk_user_banned_from_posting', 'account-not-eligible'],
  ['spam_risk_text', 'metadata-rejected'],
  ['spam_risk', 'policy-rejected'],
]);

/** The OAuth `error` values of [T2]'s error handling page that are not settled by the step. */
const oauthCodeReasons = new Map<string, PlatformClientErrorReason>([
  ['access_denied', 'denied'],
  ['invalid_scope', 'scope-missing'],
  ['server_error', 'platform-unavailable'],
  ['temporarily_unavailable', 'platform-unavailable'],
]);

function reasonByStatus(operation: PlatformClientOperation, status: number): PlatformClientErrorReason {
  if (status === 429) return 'rate-limited';
  if (status === 401) return 'token-revoked';
  if (status >= 500) return 'platform-unavailable';
  if (status === 403) return operation === 'upload' ? 'policy-rejected' : 'scope-missing';
  // Before any byte the video cannot exist, so an unreadable init answer fails the attempt instead
  // of reading as `invalid-response`, which the watcher treats as a possible upload.
  return operation === 'upload' ? 'platform-unavailable' : 'invalid-response';
}

function apiErrorCode(text: string | null): string | null {
  if (text === null) return null;
  const json = parseJsonText(text);
  if (!json.ok) return null;
  const parsed = ApiFailureSchema.safeParse(json.value);
  return parsed.success ? parsed.data.error.code : null;
}

function failure(operation: PlatformClientOperation, reason: PlatformClientErrorReason, answer: TiktokAnswer): PlatformClientError {
  const retryAfterSeconds = reason === 'rate-limited' || reason === 'quota-exhausted' ? answer.retryAfterSeconds : null;
  return new PlatformClientError('tiktok', operation, reason, { transport: false, retryAfterSeconds });
}

/** A Display or Content Posting API answer that is not a success: its code first, then its status. */
function apiFailure(operation: PlatformClientOperation, answer: TiktokAnswer): PlatformClientError {
  const code = apiErrorCode(answer.text);
  if (code === 'invalid_param') return failure(operation, operation === 'upload' ? 'media-rejected' : 'invalid-response', answer);
  const known = code === null ? undefined : apiCodeReasons.get(code);
  return failure(operation, known ?? reasonByStatus(operation, answer.status), answer);
}

/** A success status whose body broke the schema: unreadable, never guessed. */
function unreadableAnswer(operation: PlatformClientOperation): PlatformClientError {
  return new PlatformClientError('tiktok', operation, operation === 'upload' ? 'platform-unavailable' : 'invalid-response');
}

/**
 * The data of a successful API answer: status 200, `error.code` `ok`, and a body the strict schema
 * accepts. `prepare` rewrites the raw text before parsing (the post id quoting of `quotePostIds`).
 * A 200 that carries another code, or breaks the schema, is a failure.
 */
export function readApiSuccess<Output>(
  operation: PlatformClientOperation,
  answer: TiktokAnswer,
  schema: z.ZodType<Output>,
  prepare: (text: string) => string = (text) => text,
): Output {
  if (answer.status !== 200) throw apiFailure(operation, answer);
  if (answer.text === null) throw unreadableAnswer(operation);
  const json = parseJsonText(prepare(answer.text));
  if (!json.ok) throw unreadableAnswer(operation);
  const parsed = schema.safeParse(json.value);
  if (!parsed.success) throw apiFailure(operation, answer);
  return parsed.data;
}

export type OAuthStep = 'exchange' | 'refresh' | 'revoke';

/**
 * A token or revoke answer that is not a success. `invalid_grant` on a refresh means the refresh
 * token is spent, expired or revoked (section 5.2): `refresh-expired` when its stored expiry has
 * passed, `token-revoked` otherwise, which the watcher turns into `needs-reconnect`.
 */
export function oauthFailure(step: OAuthStep, answer: TiktokAnswer, refreshExpired: boolean): PlatformClientError {
  let code: string | null = null;
  if (answer.text !== null) {
    const json = parseJsonText(answer.text);
    const parsed = json.ok ? OAuthErrorSchema.safeParse(json.value) : null;
    code = parsed !== null && parsed.success ? parsed.data.error : null;
  }
  if (code === 'invalid_grant') {
    if (step === 'exchange') return failure(step, 'exchange-failed', answer);
    return failure(step, step === 'refresh' && refreshExpired ? 'refresh-expired' : 'token-revoked', answer);
  }
  const known = code === null ? undefined : oauthCodeReasons.get(code);
  if (known !== undefined) return failure(step, known, answer);
  if (answer.status === 429) return failure(step, 'rate-limited', answer);
  if (answer.status >= 500) return failure(step, 'platform-unavailable', answer);
  return failure(step, 'exchange-failed', answer);
}

/** The attempt's failure reason for a `FAILED` status; an unknown TikTok reason is not guessed at. */
export function postFailReason(failReason: string | undefined): TiktokFailReason {
  return (failReason === undefined ? undefined : failReasons.get(failReason)) ?? 'platform-unavailable';
}
