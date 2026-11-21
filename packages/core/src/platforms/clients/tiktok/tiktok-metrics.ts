import { parsePublicationUrl, platformVideoIdPatterns, type PlatformMetrics } from '@studio/shared/metrics';
import { type TokenBundle } from '../../token-bundle';
import { PlatformClientError } from '../platform-client.errors';
import { type MetricResult, type MetricsRequest, type MetricTarget } from '../platform-client.port';
import { TIKTOK_SHARE_URL_FIELDS, TIKTOK_VIDEO_QUERY_BATCH, TIKTOK_VIDEO_QUERY_FIELDS, TIKTOK_VIDEO_QUERY_URL } from './tiktok-endpoints';
import { readApiSuccess } from './tiktok-failures';
import { JSON_CALL_TIMEOUT_MS, type TiktokHttp } from './tiktok-http';
import { VideoQueryResponseSchema, VideoShareUrlResponseSchema, type QueriedVideo } from './tiktok-schemas';

/*
 * Metrics through the Display API video query [T6]: the due publications in groups of 20, one
 * request each, `ceil(N/20)` calls a pass (section 5.7). No retry inside a pass: the first failed
 * call rejects and the caller backs off. The pass budget's signal is checked at every request
 * boundary and also ends a request in flight (finding C7).
 */

/** Section 5.5 table, TikTok column: four counts; everything else TikTok does not report is null. */
export function mapVideoMetrics(video: QueriedVideo): PlatformMetrics {
  return {
    views: video.view_count,
    likes: video.like_count ?? null,
    comments: video.comment_count ?? null,
    shares: video.share_count ?? null,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
  };
}

function groupsOf<Item>(items: readonly Item[], size: number): Item[][] {
  const groups: Item[][] = [];
  for (let start = 0; start < items.length; start += size) groups.push(items.slice(start, start + size));
  return groups;
}

export class TiktokMetrics {
  constructor(private readonly http: TiktokHttp) {}

  /**
   * One result per target, in order. A target whose id is not a TikTok video id is never sent and
   * reads `not-found`. TikTok checks ownership and leaves out ids it will not report [T6] without
   * saying which case applies, so an id missing from the answer is `not-found` too.
   */
  async fetch(request: MetricsRequest): Promise<MetricResult[]> {
    const sendable = request.targets.filter((target) => platformVideoIdPatterns.tiktok.test(target.platformVideoId));
    const uniqueIds = [...new Set(sendable.map((target) => target.platformVideoId))];
    const found = new Map<string, QueriedVideo>();
    for (const ids of groupsOf(uniqueIds, TIKTOK_VIDEO_QUERY_BATCH)) {
      if (request.signal.aborted) throw new PlatformClientError('tiktok', 'metrics', 'network');
      for (const video of await this.query(ids, request.tokens, request.signal)) {
        if (ids.includes(video.id)) found.set(video.id, video);
      }
    }
    return request.targets.map((target) => this.resultFor(target, found));
  }

  private resultFor(target: MetricTarget, found: ReadonlyMap<string, QueriedVideo>): MetricResult {
    const video = found.get(target.platformVideoId);
    if (video === undefined) return { publicationId: target.publicationId, status: 'not-found' };
    return { publicationId: target.publicationId, status: 'ok', metrics: mapVideoMetrics(video), platformMediaId: target.platformMediaId };
  }

  /**
   * The canonical link of one published post, from its `share_url` (owner decision wave 4: the
   * basic scope gives no handle, so `publicationUrl()` cannot build it). Null when TikTok leaves the
   * post out or the link is not a TikTok video link for this id. One call, no retry.
   */
  async shareUrlOf(videoId: string, tokens: TokenBundle): Promise<string | null> {
    const url = new URL(TIKTOK_VIDEO_QUERY_URL);
    url.searchParams.set('fields', TIKTOK_SHARE_URL_FIELDS);
    const answer = await this.http.send({
      operation: 'upload-status',
      url,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken.revealForPlatformCall()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
      timeoutMs: JSON_CALL_TIMEOUT_MS,
    });
    const video = readApiSuccess('upload-status', answer, VideoShareUrlResponseSchema).data.videos.find((entry) => entry.id === videoId);
    if (video?.share_url === undefined) return null;
    const parsed = parsePublicationUrl(video.share_url);
    if (parsed.status !== 'recognized' || parsed.platform !== 'tiktok' || parsed.platformVideoId !== videoId) return null;
    return parsed.url;
  }

  private async query(ids: readonly string[], tokens: TokenBundle, signal: AbortSignal): Promise<QueriedVideo[]> {
    const url = new URL(TIKTOK_VIDEO_QUERY_URL);
    url.searchParams.set('fields', TIKTOK_VIDEO_QUERY_FIELDS);
    const answer = await this.http.send({
      operation: 'metrics',
      url,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken.revealForPlatformCall()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { video_ids: ids } }),
      timeoutMs: JSON_CALL_TIMEOUT_MS,
      signal,
    });
    return readApiSuccess('metrics', answer, VideoQueryResponseSchema).data.videos;
  }
}
