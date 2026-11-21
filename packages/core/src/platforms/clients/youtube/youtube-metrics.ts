import { PlatformMetricsSchema, platformVideoIdPatterns, type PlatformMetrics } from '@studio/shared/metrics';
import { type MetricResult, type MetricTarget, type MetricsRequest } from '../platform-client.port';
import { dataErrorReason, isForbiddenOnly } from './youtube-error-map';
import { bearerHeaders, parseYoutubeBody, readJsonBody, retryAfterSeconds, sendYoutubeRequest, youtubeError } from './youtube-http';
import { getYoutubeData } from './youtube-videos';
import { AnalyticsReportSchema, VideoStatisticsResponseSchema, type AnalyticsReport } from './youtube.schemas';
import {
  YOUTUBE_ANALYTICS_METRICS,
  YOUTUBE_EPOCH_DATE,
  YOUTUBE_VIDEOS_PER_LIST,
  youtubeEndpoints,
  youtubeTimeoutsMs,
  type YoutubeAnalyticsMetric,
} from './youtube.constants';

/*
 * One poll pass for YouTube (SPEC 0007 sections 5.5 and 5.7): `videos.list` statistics in groups of
 * 50 (1 unit each [G3]) plus one Analytics query per found video [G6], mapped by the section 5.5
 * table. The pass stops at the next request boundary when the budget signal aborts (finding C7),
 * and any error that is not about one video ends the whole pass with its reason id, no retry.
 */

interface VideoCounts {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

type AnalyticsAnswer = { status: 'ok'; values: Partial<Record<YoutubeAnalyticsMetric, number>> } | { status: 'not-owned' };

/** Analytics days are Pacific days ([G3] quota day); the report ends on today's Pacific date. */
const pacificDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });

function countOf(text: string | undefined): number | null {
  return text === undefined ? null : Number.parseInt(text, 10);
}

function roundedOrNull(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value);
}

/** The section 5.5 table; numbers outside `PlatformMetricsSchema` are an invalid answer, never clamped. */
function metricsOf(counts: VideoCounts, analytics: Partial<Record<YoutubeAnalyticsMetric, number>>): PlatformMetrics {
  const views = countOf(counts.viewCount);
  if (views === null) throw youtubeError('metrics', 'invalid-response');
  const minutes = analytics.estimatedMinutesWatched;
  const parsed = PlatformMetricsSchema.safeParse({
    views,
    likes: countOf(counts.likeCount),
    comments: countOf(counts.commentCount),
    shares: roundedOrNull(analytics.shares),
    saves: null,
    impressions: null,
    reach: null,
    followersGained: roundedOrNull(analytics.subscribersGained),
    watchTimeSeconds: minutes === undefined ? null : Math.round(minutes * 60),
    averageViewDurationSeconds: analytics.averageViewDuration ?? null,
    averageViewPercent: analytics.averageViewPercentage ?? null,
  });
  if (!parsed.success) throw youtubeError('metrics', 'invalid-response');
  return parsed.data;
}

/** The single totals row by column name; a video with no data yet has no row and no values. */
function analyticsValues(report: AnalyticsReport): Partial<Record<YoutubeAnalyticsMetric, number>> {
  const row = report.rows?.[0];
  const values: Partial<Record<YoutubeAnalyticsMetric, number>> = {};
  if (row === undefined) return values;
  report.columnHeaders.forEach((header, index) => {
    const metric = YOUTUBE_ANALYTICS_METRICS.find((name) => name === header.name);
    const value = row[index];
    if (metric !== undefined && value !== undefined) values[metric] = value;
  });
  return values;
}

class YoutubeMetricsPass {
  private readonly analyticsByVideo = new Map<string, AnalyticsAnswer>();

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly request: MetricsRequest,
  ) {}

  async run(): Promise<MetricResult[]> {
    const results = new Map<string, MetricResult>();
    const valid = this.request.targets.filter((target) => {
      const known = platformVideoIdPatterns.youtube.test(target.platformVideoId);
      if (!known) results.set(target.publicationId, { publicationId: target.publicationId, status: 'not-found' });
      return known;
    });
    for (let start = 0; start < valid.length; start += YOUTUBE_VIDEOS_PER_LIST) {
      const group = valid.slice(start, start + YOUTUBE_VIDEOS_PER_LIST);
      const countsById = await this.statistics([...new Set(group.map((target) => target.platformVideoId))]);
      for (const target of group) results.set(target.publicationId, await this.resultFor(target, countsById));
    }
    return this.request.targets.flatMap((target) => {
      const result = results.get(target.publicationId);
      return result === undefined ? [] : [result];
    });
  }

  private async resultFor(target: MetricTarget, countsById: ReadonlyMap<string, VideoCounts>): Promise<MetricResult> {
    const counts = countsById.get(target.platformVideoId);
    if (counts === undefined) return { publicationId: target.publicationId, status: 'not-found' };
    const analytics = await this.analytics(target.platformVideoId);
    if (analytics.status === 'not-owned') return { publicationId: target.publicationId, status: 'not-owned' };
    return { publicationId: target.publicationId, status: 'ok', metrics: metricsOf(counts, analytics.values), platformMediaId: target.platformMediaId };
  }

  /** One `videos.list` call; a video YouTube does not return is unknown to it (deleted or private). */
  private async statistics(videoIds: readonly string[]): Promise<Map<string, VideoCounts>> {
    const url = new URL(youtubeEndpoints.videos);
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', videoIds.join(','));
    url.searchParams.set('maxResults', String(YOUTUBE_VIDEOS_PER_LIST));
    url.searchParams.set('fields', 'items(id,statistics(viewCount,likeCount,commentCount))');
    const { tokens, now, signal } = this.request;
    const response = await getYoutubeData(this.fetchFn, { operation: 'metrics', url, tokens, now, signal });
    const answer = await parseYoutubeBody(response, VideoStatisticsResponseSchema, 'metrics');
    return new Map((answer.items ?? []).map((item): [string, VideoCounts] => [item.id, item.statistics]));
  }

  /**
   * One Analytics query per video, lifetime totals for `channel==MINE`. A plain `forbidden` means
   * the video is not this channel's (`not-owned`); quota, rate and scope answers end the pass.
   */
  private async analytics(videoId: string): Promise<AnalyticsAnswer> {
    const known = this.analyticsByVideo.get(videoId);
    if (known !== undefined) return known;
    const url = new URL(youtubeEndpoints.analyticsReports);
    url.searchParams.set('ids', 'channel==MINE');
    url.searchParams.set('startDate', YOUTUBE_EPOCH_DATE);
    url.searchParams.set('endDate', pacificDate.format(this.request.now));
    url.searchParams.set('metrics', YOUTUBE_ANALYTICS_METRICS.join(','));
    url.searchParams.set('filters', `video==${videoId}`);
    const response = await sendYoutubeRequest(this.fetchFn, {
      operation: 'metrics',
      url,
      method: 'GET',
      headers: bearerHeaders(this.request.tokens.accessToken.revealForPlatformCall()),
      timeoutMs: youtubeTimeoutsMs.data,
      signal: this.request.signal,
    });
    let answer: AnalyticsAnswer;
    if (response.ok) {
      answer = { status: 'ok', values: analyticsValues(await parseYoutubeBody(response, AnalyticsReportSchema, 'metrics')) };
    } else {
      const body = await readJsonBody(response, 'metrics');
      if (!isForbiddenOnly(response.status, body)) {
        throw youtubeError('metrics', dataErrorReason(response.status, body, 'metrics'), {
          retryAfterSeconds: retryAfterSeconds(response, this.request.now),
        });
      }
      answer = { status: 'not-owned' };
    }
    this.analyticsByVideo.set(videoId, answer);
    return answer;
  }
}

/** Port contract: an aborted pass rejects with `network` and its partial results are dropped. */
export async function fetchYoutubeMetrics(fetchFn: typeof fetch, request: MetricsRequest): Promise<MetricResult[]> {
  if (request.signal.aborted) throw youtubeError('metrics', 'network');
  return new YoutubeMetricsPass(fetchFn, request).run();
}
