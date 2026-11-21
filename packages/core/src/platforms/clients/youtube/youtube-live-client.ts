import { setTimeout as delay } from 'node:timers/promises';
import { platformVideoIdPatterns } from '@studio/shared/metrics';
import { type PlatformCapability } from '@studio/shared/platforms';
import { type PkceChallengeEncoding } from '../../oauth/pkce';
import { type TokenBundle } from '../../token-bundle';
import { type LivePlatformClientContext } from '../live-client-factory';
import {
  type AuthorizeUrlRequest,
  type CodeExchangeRequest,
  type MetricResult,
  type MetricsRequest,
  type PlatformClient,
  type PlatformClientCredentials,
  type PlatformIdentity,
  type UploadOutcome,
  type UploadRequest,
  type UploadStatus,
  type UploadStatusRequest,
} from '../platform-client.port';
import { fetchYoutubeMetrics } from './youtube-metrics';
import { exchangeYoutubeCode, refreshYoutubeTokens, revokeYoutubeTokens, youtubeAuthorizeUrl, youtubeScopesFor } from './youtube-oauth';
import { uploadYoutubeVideo } from './youtube-upload';
import { fetchYoutubeIdentity, fetchYoutubeUploadStatus } from './youtube-videos';

/** What the client needs beyond the registry's context; `sleep` is replaceable so B9 waits are testable. */
export interface YoutubeLiveClientDependencies extends LivePlatformClientContext {
  sleep(milliseconds: number): Promise<void>;
}

/**
 * The live YouTube client (SPEC 0007 sections 5.1, 5.2, 5.5, 5.7; ticket R4-07). Every call goes
 * through `youtube-http.ts`, the folder's only network door, with the registry's `fetch` (K9) and
 * only to the four allowlisted hosts (K6). It never logs: errors are `PlatformClientError` reason
 * ids, and no token, code, `state`, verifier, URL, title, caption, tag or account label reaches one.
 */
export class YoutubeLiveClient implements PlatformClient {
  readonly platform = 'youtube';
  readonly mode = 'live';
  readonly pkce: PkceChallengeEncoding = 'base64url';

  constructor(private readonly deps: YoutubeLiveClientDependencies) {}

  scopesFor(capabilities: readonly PlatformCapability[]): string[] {
    return youtubeScopesFor(capabilities);
  }

  authorizeUrl(request: AuthorizeUrlRequest): string {
    return youtubeAuthorizeUrl(request);
  }

  exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    return exchangeYoutubeCode(this.deps.fetch, request);
  }

  fetchIdentity(tokens: TokenBundle): Promise<PlatformIdentity> {
    return fetchYoutubeIdentity(this.deps.fetch, tokens);
  }

  refresh(tokens: TokenBundle, credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    return refreshYoutubeTokens(this.deps.fetch, tokens, credentials, now);
  }

  revoke(tokens: TokenBundle): Promise<void> {
    return revokeYoutubeTokens(this.deps.fetch, tokens);
  }

  upload(request: UploadRequest): Promise<UploadOutcome> {
    return uploadYoutubeVideo(this.deps, request);
  }

  uploadStatus(request: UploadStatusRequest): Promise<UploadStatus> {
    return fetchYoutubeUploadStatus(this.deps.fetch, request);
  }

  fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    return fetchYoutubeMetrics(this.deps.fetch, request);
  }

  /** SPEC 0006 canonical watch URL; null for an id outside the YouTube pattern. */
  publicationUrl(request: { platformVideoId: string; accountLabel: string }): string | null {
    if (!platformVideoIdPatterns.youtube.test(request.platformVideoId)) return null;
    return `https://www.youtube.com/watch?v=${request.platformVideoId}`;
  }
}

/** The registry's binding: the production `fetch` plus real B9 waits. */
export function createYoutubeLiveClient(context: LivePlatformClientContext): PlatformClient {
  return new YoutubeLiveClient({ fetch: context.fetch, sleep: (milliseconds) => delay(milliseconds) });
}
