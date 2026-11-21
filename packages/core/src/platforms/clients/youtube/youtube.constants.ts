import { type PlatformCapability } from '@studio/shared/platforms';

/*
 * YouTube facts the live client needs (SPEC 0007 sections 5.1, 5.2 and 5.7, sources [G1] to [G6],
 * re-read 2026-11-20). Every host, path and scope string lives here and nowhere else in the folder,
 * so the K6 allowlist and the section 5.2 minimal scopes are one reviewable list.
 */

/** K6: the only four hosts this client contacts, always over `https` on the default port. */
export const YOUTUBE_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'accounts.google.com',
  'oauth2.googleapis.com',
  'www.googleapis.com',
  'youtubeanalytics.googleapis.com',
]);

/** Origin of the OAuth token and revocation endpoints. */
const GOOGLE_OAUTH_ORIGIN = 'https://oauth2.googleapis.com';

/** [G1] authorization, token and revocation endpoints; [G2], [G3], [G6] data endpoints. */
export const youtubeEndpoints = Object.freeze({
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: `${GOOGLE_OAUTH_ORIGIN}/token`,
  revoke: `${GOOGLE_OAUTH_ORIGIN}/revoke`,
  channels: 'https://www.googleapis.com/youtube/v3/channels',
  videos: 'https://www.googleapis.com/youtube/v3/videos',
  upload: 'https://www.googleapis.com/upload/youtube/v3/videos',
  analyticsReports: 'https://youtubeanalytics.googleapis.com/v2/reports',
});

/** The resumable session URI Google returns must point back at the upload path on this host. */
export const YOUTUBE_UPLOAD_SESSION_HOST = 'www.googleapis.com';
export const YOUTUBE_UPLOAD_SESSION_PATH = '/upload/youtube/v3/videos';

const SCOPE_PREFIX = 'https://www.googleapis.com/auth/';

/** Section 5.2 minimal scopes, as the exact strings Google grants and echoes back. */
export const youtubeScopes = Object.freeze({
  readonly: `${SCOPE_PREFIX}youtube.readonly`,
  analyticsReadonly: `${SCOPE_PREFIX}yt-analytics.readonly`,
  upload: `${SCOPE_PREFIX}youtube.upload`,
});

export const YOUTUBE_IDENTITY_SCOPES: readonly string[] = Object.freeze([youtubeScopes.readonly]);

export const YOUTUBE_CAPABILITY_SCOPES: Readonly<Record<PlatformCapability, readonly string[]>> = Object.freeze({
  metrics: Object.freeze([youtubeScopes.readonly, youtubeScopes.analyticsReadonly]),
  publish: Object.freeze([youtubeScopes.upload]),
});

/** Every scope this client may request or keep in a bundle; anything else is never asked for. */
export const YOUTUBE_KNOWN_SCOPES: readonly string[] = Object.freeze(Object.values(youtubeScopes));

/**
 * One upload chunk: 8 MiB, a multiple of the 256 KiB Google requires for every chunk but the last
 * (resumable upload guide), small enough that a resume re-sends little.
 */
export const YOUTUBE_UPLOAD_CHUNK_BYTES = 32 * 262_144;

/** The MIME type of `final.mp4`, sent as `X-Upload-Content-Type` and on every chunk. */
export const YOUTUBE_UPLOAD_CONTENT_TYPE = 'video/mp4';

/** [G3] `videos.list` accepts at most 50 ids per call (section 5.7: `ceil(N/50)` calls). */
export const YOUTUBE_VIDEOS_PER_LIST = 50;

/**
 * Per-request timeouts. A hung connection must not hold the watcher or the token lock forever
 * (`tokenLockBounds.operationBudgetMs` is 40 s, so OAuth calls stay well under it).
 */
export const youtubeTimeoutsMs = Object.freeze({
  oauth: 20_000,
  data: 30_000,
  uploadChunk: 300_000,
});

/** The largest response body read; Google's answers here are a few KiB, error pages included. */
export const YOUTUBE_MAX_RESPONSE_BYTES = 262_144;

/**
 * Section 5.5 table: the Analytics metrics of one per-video query, in request order. `views`,
 * `likes` and `comments` come from `videos.list` statistics instead.
 */
export type YoutubeAnalyticsMetric =
  | 'shares'
  | 'subscribersGained'
  | 'estimatedMinutesWatched'
  | 'averageViewDuration'
  | 'averageViewPercentage';
export const YOUTUBE_ANALYTICS_METRICS: readonly YoutubeAnalyticsMetric[] = Object.freeze([
  'shares',
  'subscribersGained',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
]);

/** The first day YouTube existed: the earliest `startDate` a lifetime-total query can need. */
export const YOUTUBE_EPOCH_DATE = '2005-02-14';
