import { metricsBounds, platformVideoIdPatterns } from '@studio/shared/metrics';
import { z } from 'zod';
import { MAX_TOKEN_TEXT_CHARS } from '../../token-bundle';

/*
 * Strict allowlists for every TikTok answer the client uses (K10). TikTok's text fields
 * (`message`, `error_description`, `log_id`, `fail_reason`) are bounded here so a parse can finish,
 * but the client reads only the closed codes from them and never stores, logs or rethrows them.
 */

/** A token as TikTok returns it: printable ASCII, no spaces, within the bundle's bound. */
const TokenTextSchema = z
  .string()
  .min(1)
  .max(MAX_TOKEN_TEXT_CHARS)
  .regex(/^[\x21-\x7e]+$/);

/** Lifetimes in seconds (U6: always the returned values, never a constant); at most ten years. */
const LifetimeSecondsSchema = z.number().int().positive().max(315_360_000);

/** `POST /v2/oauth/token/` success, for both `authorization_code` and `refresh_token` [T2]. */
export const TokenSuccessSchema = z
  .object({
    access_token: TokenTextSchema,
    expires_in: LifetimeSecondsSchema,
    open_id: z.string().max(128),
    // Rotated on every refresh [T2]: required, so a refresh never keeps a spent refresh token.
    refresh_token: TokenTextSchema,
    refresh_expires_in: LifetimeSecondsSchema,
    scope: z.string().max(1_000),
    token_type: z.enum(['Bearer', 'bearer']),
  })
  .strict();
export type TokenSuccess = z.infer<typeof TokenSuccessSchema>;

/** The OAuth error body of the token and revoke endpoints. */
export const OAuthErrorSchema = z
  .object({
    error: z.string().max(100),
    error_description: z.string().max(4_000).optional(),
    log_id: z.string().max(200).optional(),
  })
  .strict();

/** Revoke success: an empty JSON object [T2]. */
export const RevokeSuccessSchema = z.object({}).strict();

/** One granted scope as TikTok spells them (`user.info.basic`, `video.list`, `video.upload`). */
const ScopeNameSchema = z.string().regex(/^[a-z0-9._]{1,120}$/);

/** The comma-separated `scope` field as the bundle's list: unique, at most 12 (token bundle bound). */
export function parseGrantedScopes(scope: string): string[] | null {
  const names = [...new Set(scope.split(',').map((name) => name.trim()).filter((name) => name.length > 0))];
  const parsed = z.array(ScopeNameSchema).max(12).safeParse(names);
  return parsed.success ? parsed.data : null;
}

/** The `error` object of every Display and Content Posting API answer; the docs spell the id both ways. */
const ApiErrorSchema = z
  .object({
    code: z.string().max(100),
    message: z.string().max(4_000).optional(),
    log_id: z.string().max(200).optional(),
    logid: z.string().max(200).optional(),
  })
  .strict();

/** A failed API answer: only `error.code` is read; `data` is ignored whatever it holds. */
export const ApiFailureSchema = z.object({ data: z.unknown().optional(), error: ApiErrorSchema }).strict();

function apiEnvelope<Data extends z.ZodType>(data: Data) {
  return z.object({ data, error: ApiErrorSchema.extend({ code: z.literal('ok') }) }).strict();
}

/** `GET /v2/user/info/?fields=open_id,display_name`. */
export const UserInfoResponseSchema = apiEnvelope(
  z
    .object({
      user: z
        .object({
          // The pattern `account.json` stores (`connection-files.ts`).
          open_id: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
          display_name: z.string().max(100),
        })
        .strict(),
    })
    .strict(),
);

/** `POST /v2/post/publish/inbox/video/init/` [T4]; `upload_url` is checked by host before use. */
export const InboxInitResponseSchema = apiEnvelope(
  z
    .object({
      publish_id: z.string().regex(/^[\x21-\x7e]{1,64}$/),
      upload_url: z.string().min(1).max(2_048),
    })
    .strict(),
);

/** A post id TikTok reports, already quoted by `quotePostIds` so no int64 digit is lost. */
const PostIdSchema = z.string().regex(platformVideoIdPatterns.tiktok);

/** `POST /v2/post/publish/status/fetch/` [T8]. */
export const PostStatusResponseSchema = apiEnvelope(
  z
    .object({
      status: z.enum(['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE', 'FAILED']),
      fail_reason: z.string().max(200).optional(),
      // Spelled `publicaly` on [T8]; the corrected spelling is accepted too so a doc fix does not
      // turn every status answer into `invalid-response`.
      publicaly_available_post_id: z.array(PostIdSchema).max(10).optional(),
      publicly_available_post_id: z.array(PostIdSchema).max(10).optional(),
      uploaded_bytes: z.number().int().min(0).optional(),
      downloaded_bytes: z.number().int().min(0).optional(),
    })
    .strict(),
);
export type PostStatusData = z.infer<typeof PostStatusResponseSchema>['data'];

const CountSchema = z.number().int().min(0).max(1e12);

/** `POST /v2/video/query/` [T6]; ids are strings on the video object page, counts integers. */
export const VideoQueryResponseSchema = apiEnvelope(
  z
    .object({
      videos: z
        .array(
          z
            .object({
              id: z.string().regex(platformVideoIdPatterns.tiktok),
              view_count: CountSchema,
              like_count: CountSchema.nullable().optional(),
              comment_count: CountSchema.nullable().optional(),
              share_count: CountSchema.nullable().optional(),
            })
            .strict(),
        )
        .max(20),
      cursor: z.number().int().optional(),
      has_more: z.boolean().optional(),
    })
    .strict(),
);
export type QueriedVideo = z.infer<typeof VideoQueryResponseSchema>['data']['videos'][number];

/** `POST /v2/video/query/` asking only `id,share_url` for one published post (owner decision wave 4). */
export const VideoShareUrlResponseSchema = apiEnvelope(
  z
    .object({
      videos: z
        .array(
          z
            .object({
              id: z.string().regex(platformVideoIdPatterns.tiktok),
              share_url: z.string().max(metricsBounds.urlChars).optional(),
            })
            .strict(),
        )
        .max(1),
      cursor: z.number().int().optional(),
      has_more: z.boolean().optional(),
    })
    .strict(),
);

/**
 * [T8] types the public post ids as `list<int64>`. TikTok ids run to 19 digits, beyond the 2^53
 * that `JSON.parse` keeps exactly, so the digits are quoted in the raw text before parsing. Only
 * an array of bare digit runs under that key is rewritten; any other shape is left for the schema
 * to refuse.
 */
export function quotePostIds(text: string): string {
  return text.replace(/"(publicaly|publicly)_available_post_id"\s*:\s*\[([0-9,\s]*)\]/g, (_match, spelling: string, list: string) => {
    const ids = list
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .map((id) => `"${id}"`);
    return `"${spelling}_available_post_id":[${ids.join(',')}]`;
  });
}
