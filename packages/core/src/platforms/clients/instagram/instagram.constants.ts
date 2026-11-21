import { type PlatformCapability } from '@studio/shared/platforms';

/*
 * Instagram Login facts as data (SPEC 0007 sections 5.1, 5.2 and 5.5, U4; ticket R4-08). Re-read on
 * 2026-11-20 from [M2] business-login, [M3] media insights and [M4] overview. The client contacts
 * these three hosts only (K6) and asks for these two scopes only (OD8: metrics only, no publishing).
 */

/** The three Instagram Login hosts of the K6 allowlist; nothing else is ever contacted. */
export const INSTAGRAM_HOSTS = Object.freeze({
  authorize: 'www.instagram.com',
  codeExchange: 'api.instagram.com',
  graph: 'graph.instagram.com',
});

export const INSTAGRAM_ALLOWED_HOSTS: readonly string[] = Object.freeze(Object.values(INSTAGRAM_HOSTS));

/** The Graph version the [M3] and get-started pages show as current on 2026-11-20. */
export const INSTAGRAM_GRAPH_VERSION = 'v27.0';

export const INSTAGRAM_PATHS = Object.freeze({
  authorize: '/oauth/authorize',
  codeExchange: '/oauth/access_token',
  /** Unversioned in [M2]. */
  longLivedExchange: '/access_token',
  /** Unversioned in [M2]. */
  refresh: '/refresh_access_token',
  identity: `/${INSTAGRAM_GRAPH_VERSION}/me`,
  media: `/${INSTAGRAM_GRAPH_VERSION}/me/media`,
  insights: (mediaId: string): string => `/${INSTAGRAM_GRAPH_VERSION}/${mediaId}/insights`,
});

/** Section 5.2 minimal scopes: identity always, plus the scopes of each enabled capability. */
export const INSTAGRAM_IDENTITY_SCOPES: readonly string[] = Object.freeze(['instagram_business_basic']);
export const INSTAGRAM_CAPABILITY_SCOPES: Readonly<Record<PlatformCapability, readonly string[]>> = Object.freeze({
  metrics: Object.freeze(['instagram_business_manage_insights']),
  // OD8: the studio never publishes to Instagram, so no publish scope is ever requested.
  publish: Object.freeze([]),
});
export const INSTAGRAM_KNOWN_SCOPES: readonly string[] = Object.freeze([
  ...INSTAGRAM_IDENTITY_SCOPES,
  ...INSTAGRAM_CAPABILITY_SCOPES.metrics,
]);

/** Metrics every media type answers [M3]; mapped by the SPEC 0007 section 5.5 table. */
export const INSTAGRAM_BASE_METRICS: readonly string[] = Object.freeze(['views', 'likes', 'comments', 'shares', 'saved', 'reach']);

/** Reel-only watch-time metrics [M3]; asking them for an image is an error, so only videos get them. */
export const INSTAGRAM_REEL_METRICS: readonly string[] = Object.freeze(['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']);

/**
 * U4: [M3] does not state the unit of the two watch-time metrics (checked 2026-11-20). They are read
 * as milliseconds, the unit these values carry in practice; the AC 63 first snapshot is compared
 * with the in-app average watch time to confirm it. One constant, so a correction is one line.
 */
export const INSTAGRAM_WATCH_TIME_UNITS_PER_SECOND = 1_000;

export const instagramRequestBounds = Object.freeze({
  /** Every call is bounded; a refresh under `token.lock` ends well inside its 40 s budget. */
  timeoutMs: 15_000,
  /** Largest response body read; Instagram's answers are a few KiB. */
  maxResponseBytes: 1_048_576,
  /** Section 5.5: at most 5 media list pages a pass. */
  mediaPagesPerPass: 5,
  mediaPageSize: 100,
});
