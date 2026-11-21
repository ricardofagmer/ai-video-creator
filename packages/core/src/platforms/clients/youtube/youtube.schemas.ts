import { IsoDateTimeSchema } from '@studio/shared/run-format';
import { z } from 'zod';
import { MAX_TOKEN_TEXT_CHARS } from '../../token-bundle';

/*
 * Strict allowlists for every YouTube answer this client reads (SPEC 0007 K10). Data API calls
 * send a `fields` mask, so each answer holds exactly the keys below and `.strict()` refuses
 * anything else instead of silently carrying it along.
 */

/** A token as Google returns it: printable ASCII, no spaces, within the vault's bound. */
const TokenTextSchema = z
  .string()
  .min(1)
  .max(MAX_TOKEN_TEXT_CHARS)
  .regex(/^[\x21-\x7e]+$/);

const LifetimeSecondsSchema = z.number().int().positive().max(400 * 86_400);

/** [G1] token endpoint answer to an authorization-code exchange or a refresh. */
export const GoogleTokenResponseSchema = z
  .object({
    access_token: TokenTextSchema,
    expires_in: LifetimeSecondsSchema,
    token_type: z.literal('Bearer'),
    scope: z.string().max(2_000).optional(),
    refresh_token: TokenTextSchema.optional(),
    refresh_token_expires_in: LifetimeSecondsSchema.optional(),
    // Present only when an identity scope is requested, which this client never does; never read.
    id_token: z.string().max(8_000).optional(),
  })
  .strict();
export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;

/** A YouTube channel id as `account.json` stores it (`platformAccountId`). */
const ChannelIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);

/** `channels.list?part=snippet&mine=true&fields=items(id,snippet(title))`. */
export const ChannelsResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: ChannelIdSchema,
            snippet: z.object({ title: z.string().trim().min(1).max(100) }).strict(),
          })
          .strict(),
      )
      .max(1)
      .optional(),
  })
  .strict();

/** A YouTube video id ([`platformVideoIdPatterns`]). */
const VideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

/** Data API counts are decimal strings (`"1234"`); bounded like `PlatformMetricsSchema`. */
export const CountTextSchema = z.string().regex(/^[0-9]{1,13}$/);

/** `videos.list?part=statistics&fields=items(id,statistics(viewCount,likeCount,commentCount))`. */
export const VideoStatisticsResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: VideoIdSchema,
            statistics: z
              .object({
                viewCount: CountTextSchema.optional(),
                likeCount: CountTextSchema.optional(),
                commentCount: CountTextSchema.optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();

/** [G2] `status.uploadStatus` values; `uploaded` means YouTube is still processing. */
export const UploadStatusValueSchema = z.enum(['uploaded', 'processed', 'failed', 'rejected', 'deleted']);

/**
 * One video's processing state, as both the upload's final answer and `videos.list` return it
 * under the mask `id,snippet(publishedAt),status(uploadStatus,failureReason,rejectionReason)`.
 */
export const VideoStateSchema = z
  .object({
    id: VideoIdSchema,
    snippet: z.object({ publishedAt: IsoDateTimeSchema.optional() }).strict().optional(),
    status: z
      .object({
        uploadStatus: UploadStatusValueSchema,
        failureReason: z.string().max(60).optional(),
        rejectionReason: z.string().max(60).optional(),
      })
      .strict(),
  })
  .strict();
export type VideoState = z.infer<typeof VideoStateSchema>;

export const VideoStateListSchema = z.object({ items: z.array(VideoStateSchema).max(1).optional() }).strict();

/** [G6] `reports.query` result table; values are numbers, dimensions are never requested. */
export const AnalyticsReportSchema = z
  .object({
    kind: z.literal('youtubeAnalytics#resultTable'),
    columnHeaders: z
      .array(
        z
          .object({
            name: z.string().max(60),
            columnType: z.enum(['DIMENSION', 'METRIC']),
            dataType: z.string().max(20),
          })
          .strict(),
      )
      .max(10),
    rows: z.array(z.array(z.number().min(0).max(1e13))).max(1).optional(),
  })
  .strict();
export type AnalyticsReport = z.infer<typeof AnalyticsReportSchema>;
