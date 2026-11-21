import { isPlatformVideoId, PlatformMetricsSchema, type PlatformMetrics } from '@studio/shared/metrics';
import { type TokenBundle } from '../../token-bundle';
import { PlatformClientError } from '../platform-client.errors';
import { type MetricResult, type MetricsRequest, type MetricTarget } from '../platform-client.port';
import {
  INSTAGRAM_BASE_METRICS,
  INSTAGRAM_PATHS,
  INSTAGRAM_REEL_METRICS,
  INSTAGRAM_WATCH_TIME_UNITS_PER_SECOND,
  instagramRequestBounds,
} from './instagram.constants';
import { isObjectNotFound } from './instagram-errors';
import { type InstagramHttp, type InstagramRequest } from './instagram-http';
import { InsightsResponseSchema, MediaPageResponseSchema, type InsightsResponse } from './instagram.schemas';

/*
 * Media insights for pasted Instagram links (SPEC 0007 section 5.5, OD8, [M3]). A publication holds
 * the post shortcode; the media id is found once by listing the account's own media (at most 5
 * pages a pass, one listing for every target of the pass) and returned for the cursor, so later
 * passes make one insights call per publication. Any failure other than a missing object ends the
 * pass (section 5.7: no retry inside a pass).
 */

interface ResolvedMedia {
  id: string;
  isVideo: boolean;
}

interface ShortcodeResolution {
  found: ReadonlyMap<string, ResolvedMedia>;
  /** True when the whole media list was read, so a shortcode not found is not this account's media. */
  complete: boolean;
}

const MEDIA_ID_PATTERN = /^[0-9]{1,40}$/;

function throwIfAborted(signal: AbortSignal): void {
  // Port contract (finding C7): an aborted pass rejects with `network`; partial results are dropped.
  if (signal.aborted) throw new PlatformClientError('instagram', 'metrics', 'network');
}

/** A cached id from the cursor is used only when it is a plain Graph id, before any path join. */
function cachedMediaId(target: MetricTarget): string | null {
  return target.platformMediaId !== null && MEDIA_ID_PATTERN.test(target.platformMediaId) ? target.platformMediaId : null;
}

async function resolveShortcodes(
  http: InstagramHttp,
  wanted: ReadonlySet<string>,
  tokens: TokenBundle,
  signal: AbortSignal,
): Promise<ShortcodeResolution> {
  const found = new Map<string, ResolvedMedia>();
  let after: string | null = null;
  for (let page = 0; page < instagramRequestBounds.mediaPagesPerPass; page += 1) {
    throwIfAborted(signal);
    const query: Record<string, string> = { fields: 'id,shortcode,media_type', limit: String(instagramRequestBounds.mediaPageSize) };
    if (after !== null) query.after = after;
    const listing = await http.sendParsed(
      { operation: 'metrics', method: 'GET', host: 'graph', path: INSTAGRAM_PATHS.media, query, bearer: tokens.accessToken, signal },
      MediaPageResponseSchema,
    );
    for (const item of listing.data) {
      if (item.shortcode !== undefined && wanted.has(item.shortcode)) found.set(item.shortcode, { id: item.id, isVideo: item.media_type === 'VIDEO' });
    }
    // `paging.next` itself is never requested: it is a full URL that carries the token.
    const paging = listing.paging;
    const nextCursor = paging !== undefined && paging.next !== undefined ? paging.cursors?.after : undefined;
    if (nextCursor === undefined) return { found, complete: true };
    if (found.size === wanted.size) return { found, complete: false };
    after = nextCursor;
  }
  return { found, complete: false };
}

function metricValue(insights: InsightsResponse, name: string): number | null {
  const item = insights.data.find((entry) => entry.name === name);
  if (item === undefined) return null;
  return item.total_value?.value ?? item.values?.[0]?.value ?? null;
}

function watchTimeSeconds(value: number | null): number | null {
  return value === null ? null : value / INSTAGRAM_WATCH_TIME_UNITS_PER_SECOND;
}

/** Section 5.5 table; null when `views` is not there yet ([M3]: unavailable data is empty, not 0). */
function toPlatformMetrics(insights: InsightsResponse): PlatformMetrics | null {
  const views = metricValue(insights, 'views');
  if (views === null) return null;
  const totalSeconds = watchTimeSeconds(metricValue(insights, 'ig_reels_video_view_total_time'));
  const averageSeconds = watchTimeSeconds(metricValue(insights, 'ig_reels_avg_watch_time'));
  const parsed = PlatformMetricsSchema.safeParse({
    views,
    likes: metricValue(insights, 'likes'),
    comments: metricValue(insights, 'comments'),
    shares: metricValue(insights, 'shares'),
    saves: metricValue(insights, 'saved'),
    impressions: null,
    reach: metricValue(insights, 'reach'),
    followersGained: null,
    watchTimeSeconds: totalSeconds === null ? null : Math.round(totalSeconds),
    averageViewDurationSeconds: averageSeconds === null ? null : Math.round(averageSeconds * 1_000) / 1_000,
    averageViewPercent: null,
  });
  if (!parsed.success) throw new PlatformClientError('instagram', 'metrics', 'invalid-response');
  return parsed.data;
}

type InsightsOutcome = { status: 'ok'; insights: InsightsResponse } | { status: 'not-found' };

async function fetchInsights(http: InstagramHttp, media: ResolvedMedia, tokens: TokenBundle, signal: AbortSignal): Promise<InsightsOutcome> {
  const metrics = media.isVideo ? [...INSTAGRAM_BASE_METRICS, ...INSTAGRAM_REEL_METRICS] : INSTAGRAM_BASE_METRICS;
  const request: InstagramRequest = {
    operation: 'metrics',
    method: 'GET',
    host: 'graph',
    path: INSTAGRAM_PATHS.insights(media.id),
    query: { metric: metrics.join(',') },
    bearer: tokens.accessToken,
    signal,
  };
  const outcome = await http.send(request);
  if (outcome.status === 'failed') {
    const { failure } = outcome;
    if (isObjectNotFound(failure)) return { status: 'not-found' };
    throw http.failureError('metrics', failure);
  }
  return { status: 'ok', insights: http.parse('metrics', outcome.body, InsightsResponseSchema) };
}

/**
 * One result per target the pass could answer. A target is left out, and waits for the next pass,
 * when its shortcode was not reached within the page budget or its numbers are not available yet.
 */
export async function fetchInstagramMetrics(http: InstagramHttp, request: MetricsRequest): Promise<MetricResult[]> {
  const { signal, tokens } = request;
  throwIfAborted(signal);
  const wanted = new Set(
    request.targets
      .filter((target) => cachedMediaId(target) === null && isPlatformVideoId('instagram', target.platformVideoId))
      .map((target) => target.platformVideoId),
  );
  const resolution: ShortcodeResolution = wanted.size === 0 ? { found: new Map<string, ResolvedMedia>(), complete: true } : await resolveShortcodes(http, wanted, tokens, signal);
  const results: MetricResult[] = [];
  for (const target of request.targets) {
    throwIfAborted(signal);
    const cached = cachedMediaId(target);
    // Cached ids are always videos: a non-video's id is never returned for the cursor (below).
    const media = cached !== null ? { id: cached, isVideo: true } : resolution.found.get(target.platformVideoId);
    if (media === undefined) {
      if (resolution.complete || !isPlatformVideoId('instagram', target.platformVideoId)) {
        results.push({ publicationId: target.publicationId, status: 'not-found' });
      }
      continue;
    }
    const outcome = await fetchInsights(http, media, tokens, signal);
    if (outcome.status === 'not-found') {
      results.push({ publicationId: target.publicationId, status: 'not-found' });
      continue;
    }
    const metrics = toPlatformMetrics(outcome.insights);
    if (metrics === null) continue;
    results.push({ publicationId: target.publicationId, status: 'ok', metrics, platformMediaId: media.isVideo ? media.id : null });
  }
  return results;
}
