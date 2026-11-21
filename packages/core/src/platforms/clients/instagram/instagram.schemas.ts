import { MAX_TOKEN_TEXT_CHARS } from '../../token-bundle';
import { z } from 'zod';

/*
 * Every Instagram answer is untrusted (K10): each body passes one of these strict allowlists before
 * any field is read. The keys are the documented ones of [M2], [M3] and the IG Media reference;
 * an unknown key fails the parse and the call answers `invalid-response`, never a guess.
 */

/** A token as Instagram returns it: printable ASCII, no spaces, within the bundle's bound. */
const TokenTextSchema = z
  .string()
  .min(1)
  .max(MAX_TOKEN_TEXT_CHARS)
  .regex(/^[\x21-\x7e]+$/);

/** Lifetimes come from the answer, never a constant (U4, U6); bounded to about 3 years. */
const ExpiresInSchema = z.number().int().positive().max(100_000_000);

/** Graph ids are decimal strings; the bundle and the cursor hold them as text. */
const GraphIdSchema = z.string().regex(/^[0-9]{1,40}$/);

/**
 * `permissions` is a comma-separated string in [M2]; an array form is accepted too because the same
 * endpoint has answered both. Only the scope names matter, and only the known ones are kept.
 */
const PermissionsSchema = z.union([z.string().max(2_000), z.array(z.string().max(120)).max(50)]);

const ShortLivedGrantSchema = z
  .object({
    access_token: TokenTextSchema,
    // Read as text or number and never used: a 17-digit number loses precision in JSON.parse.
    user_id: z.union([z.string().max(40), z.number()]),
    permissions: PermissionsSchema,
  })
  .strict();

/** [M2] step 2 answer on `api.instagram.com`: wrapped in `data` as documented, or flat. */
export const ShortLivedTokenResponseSchema = z.union([
  z.object({ data: z.array(ShortLivedGrantSchema).length(1) }).strict(),
  ShortLivedGrantSchema,
]);
export type ShortLivedTokenResponse = z.infer<typeof ShortLivedTokenResponseSchema>;

/** [M2] long-lived exchange and refresh answer on `graph.instagram.com`. */
export const LongLivedTokenResponseSchema = z
  .object({
    access_token: TokenTextSchema,
    token_type: z.string().regex(/^[Bb]earer$/),
    expires_in: ExpiresInSchema,
  })
  .strict();

/** `GET /me?fields=user_id,username`; Graph always adds the app-scoped `id`. */
export const IdentityResponseSchema = z
  .object({
    id: GraphIdSchema.optional(),
    user_id: GraphIdSchema,
    username: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
  })
  .strict();

const MediaItemSchema = z
  .object({
    id: GraphIdSchema,
    shortcode: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']).optional(),
  })
  .strict();
export type InstagramMediaItem = z.infer<typeof MediaItemSchema>;

const PagingCursorSchema = z.string().regex(/^[A-Za-z0-9_=+/-]{1,512}$/);

/** `GET /me/media` page. `paging.next` is never followed: it is a URL carrying the token. */
export const MediaPageResponseSchema = z
  .object({
    data: z.array(MediaItemSchema).max(500),
    paging: z
      .object({
        cursors: z.object({ before: PagingCursorSchema.optional(), after: PagingCursorSchema.optional() }).strict().optional(),
        next: z.string().max(4_096).optional(),
        previous: z.string().max(4_096).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const InsightValueSchema = z.number().min(0).max(1e15);

const InsightSchema = z
  .object({
    name: z.string().max(64),
    period: z.string().max(32).optional(),
    values: z
      .array(z.object({ value: InsightValueSchema, end_time: z.string().max(40).optional() }).strict())
      .max(10)
      .optional(),
    total_value: z.object({ value: InsightValueSchema }).strict().optional(),
    title: z.string().max(200).optional(),
    description: z.string().max(1_000).optional(),
    id: z.string().max(200).optional(),
  })
  .strict();

/** [M3] media insights; an empty `data` means the numbers are not there yet (up to 48 h late). */
export const InsightsResponseSchema = z.object({ data: z.array(InsightSchema).max(20) }).strict();
export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

/**
 * The two error shapes: Graph `{ error: { code, error_subcode } }` and the `api.instagram.com`
 * OAuth form `{ error_type, code, error_message }`. Only the numbers are read; every text field is
 * accepted and dropped unread (K7, K10), so it never reaches a log, a file or an error.
 */
export const GraphErrorResponseSchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
        type: z.string().optional(),
        code: z.number().int(),
        error_subcode: z.number().int().optional(),
        is_transient: z.boolean().optional(),
        error_user_title: z.string().optional(),
        error_user_msg: z.string().optional(),
        error_data: z.unknown().optional(),
        fbtrace_id: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const OAuthErrorResponseSchema = z
  .object({
    error_type: z.string().optional(),
    code: z.number().int(),
    error_message: z.string().optional(),
  })
  .strict();
