import { setTimeout as delay } from 'node:timers/promises';
import { type PlatformCapability } from '@studio/shared/platforms';
import { type TokenBundle } from '../../token-bundle';
import { type LivePlatformClientContext } from '../live-client-factory';
import { PlatformClientError } from '../platform-client.errors';
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
import { tiktokCapabilityScopes, tiktokIdentityScopes, TIKTOK_USER_INFO_FIELDS, TIKTOK_USER_INFO_URL } from './tiktok-endpoints';
import { readApiSuccess } from './tiktok-failures';
import { JSON_CALL_TIMEOUT_MS, TiktokHttp } from './tiktok-http';
import { TiktokMetrics } from './tiktok-metrics';
import { buildAuthorizeUrl, TiktokOAuth } from './tiktok-oauth';
import { TiktokPublisher, type ResumeWait } from './tiktok-publisher';
import { UserInfoResponseSchema } from './tiktok-schemas';

/** What the client is built from; `wait` defaults to a real timer and is replaced in tests. */
export interface TiktokClientOptions {
  context: LivePlatformClientContext;
  wait?: ResumeWait;
}

/**
 * The live TikTok client (SPEC 0007 sections 5.1, 5.2, 5.4, 5.5, 5.7; ticket R4-09): Login Kit for
 * Desktop with PKCE (hex challenge), the inbox draft upload (`video.upload`, Q2 option a), and the
 * video query for metrics. It calls only the hosts of section 5.1 through the context's `fetch`,
 * parses every answer with a strict schema and reports failures as closed reason ids (K6, K7, K10).
 * It holds no token: each call receives the bundle and the registry's redactor already knows it.
 */
export class TiktokPlatformClient implements PlatformClient {
  readonly platform = 'tiktok';
  readonly mode = 'live';
  readonly pkce = 'hex';

  private readonly http: TiktokHttp;
  private readonly oauth: TiktokOAuth;
  private readonly publisher: TiktokPublisher;
  private readonly metrics: TiktokMetrics;

  constructor(options: TiktokClientOptions) {
    this.http = new TiktokHttp(options.context.fetch);
    this.oauth = new TiktokOAuth(this.http);
    this.publisher = new TiktokPublisher(this.http, options.wait ?? ((milliseconds) => delay(milliseconds)));
    this.metrics = new TiktokMetrics(this.http);
  }

  scopesFor(capabilities: readonly PlatformCapability[]): string[] {
    const scopes = [...tiktokIdentityScopes, ...capabilities.flatMap((capability) => tiktokCapabilityScopes[capability])];
    return [...new Set(scopes)];
  }

  authorizeUrl(request: AuthorizeUrlRequest): string {
    return buildAuthorizeUrl(request);
  }

  exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    return this.oauth.exchangeCode(request);
  }

  /**
   * One user info call. Under the section 5.2 scope `user.info.basic` TikTok returns the display
   * name, not the @handle (`username` needs `user.info.profile`), so the label is the display name.
   */
  async fetchIdentity(tokens: TokenBundle): Promise<PlatformIdentity> {
    const url = new URL(TIKTOK_USER_INFO_URL);
    url.searchParams.set('fields', TIKTOK_USER_INFO_FIELDS);
    const answer = await this.http.send({
      operation: 'identity',
      url,
      method: 'GET',
      headers: { Authorization: `Bearer ${tokens.accessToken.revealForPlatformCall()}` },
      timeoutMs: JSON_CALL_TIMEOUT_MS,
    });
    const user = readApiSuccess('identity', answer, UserInfoResponseSchema).data.user;
    return { accountLabel: user.display_name, platformAccountId: user.open_id };
  }

  refresh(tokens: TokenBundle, credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    return this.oauth.refresh(tokens, credentials, now);
  }

  revoke(tokens: TokenBundle, credentials: PlatformClientCredentials | null): Promise<void> {
    return this.oauth.revoke(tokens, credentials);
  }

  upload(request: UploadRequest): Promise<UploadOutcome> {
    return this.publisher.upload(request);
  }

  /**
   * A `published` status also carries the post link from `share_url`. The status is already
   * decided, so a failed link query only leaves the link out (the owner pastes it, R3); it never
   * turns a published post into a failure.
   */
  async uploadStatus(request: UploadStatusRequest): Promise<UploadStatus> {
    const status = await this.publisher.uploadStatus(request);
    if (status.state !== 'published') return status;
    try {
      return { ...status, publicationUrl: await this.metrics.shareUrlOf(status.platformVideoId, request.tokens) };
    } catch (error) {
      if (error instanceof PlatformClientError) return { ...status, publicationUrl: null };
      throw error;
    }
  }

  fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    return this.metrics.fetch(request);
  }

  /**
   * Null: the canonical URL needs the @handle (SPEC 0006 rules, `parsePublicationUrl`), and the
   * stored label is a display name, which can look like a handle without being one. Building from
   * it could link the wrong account, so the owner pastes the link instead (section 5.4).
   */
  publicationUrl(): string | null {
    return null;
  }
}
