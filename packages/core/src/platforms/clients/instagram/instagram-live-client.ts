import { isPlatformVideoId } from '@studio/shared/metrics';
import { type PlatformCapability } from '@studio/shared/platforms';
import { type PkceChallengeEncoding } from '../../oauth/pkce';
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
  type UploadStatus,
} from '../platform-client.port';
import { INSTAGRAM_CAPABILITY_SCOPES, INSTAGRAM_IDENTITY_SCOPES } from './instagram.constants';
import { InstagramHttp } from './instagram-http';
import { fetchInstagramMetrics } from './instagram-metrics';
import { exchangeInstagramCode, fetchInstagramIdentity, instagramAuthorizeUrl, refreshInstagramToken } from './instagram-oauth';

/**
 * The live Instagram client (SPEC 0007 sections 5.1, 5.2, 5.5 and 5.7; ticket R4-08; OD8). Instagram
 * Login, metrics only: connect, identity, token re-extension and media insights. Publishing is not
 * supported, so `upload` refuses with `account-not-eligible` and `uploadStatus` answers `failed`
 * with that reason, both without a request, as the mock client does for the same profile.
 */
export class InstagramLiveClient implements PlatformClient {
  readonly platform = 'instagram';
  readonly mode = 'live';
  /** U4 / [M2]: Instagram Login documents no PKCE; the single-use `state` still binds the flow. */
  readonly pkce: PkceChallengeEncoding = 'none';

  private readonly http: InstagramHttp;

  constructor(context: LivePlatformClientContext) {
    this.http = new InstagramHttp(context.fetch);
  }

  scopesFor(capabilities: readonly PlatformCapability[]): string[] {
    const scopes = [...INSTAGRAM_IDENTITY_SCOPES, ...capabilities.flatMap((capability) => INSTAGRAM_CAPABILITY_SCOPES[capability])];
    return [...new Set(scopes)];
  }

  authorizeUrl(request: AuthorizeUrlRequest): string {
    return instagramAuthorizeUrl(request);
  }

  exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    return exchangeInstagramCode(this.http, request);
  }

  fetchIdentity(tokens: TokenBundle): Promise<PlatformIdentity> {
    return fetchInstagramIdentity(this.http, tokens);
  }

  refresh(tokens: TokenBundle, _credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    return refreshInstagramToken(this.http, tokens, now);
  }

  /**
   * [M2] documents no revoke endpoint for Instagram Login, so nothing is sent. The rejection makes
   * disconnect record `revoke: failed` and the page tell the owner to remove the app's access in
   * Instagram's own settings (section 5.2); the Keychain delete goes on.
   */
  async revoke(): Promise<void> {
    throw new PlatformClientError('instagram', 'revoke', 'account-not-eligible');
  }

  /** OD8: never a network call; the caller's file handle is not read. */
  async upload(): Promise<UploadOutcome> {
    throw new PlatformClientError('instagram', 'upload', 'account-not-eligible');
  }

  /** OD8: there is never an Instagram upload to follow, so the answer is final and local. */
  async uploadStatus(): Promise<UploadStatus> {
    return { state: 'failed', reasonId: 'account-not-eligible' };
  }

  fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    return fetchInstagramMetrics(this.http, request);
  }

  /** The SPEC 0006 canonical reel URL; the caller checks it with `parsePublicationUrl`. */
  publicationUrl(request: { platformVideoId: string; accountLabel: string }): string | null {
    if (!isPlatformVideoId('instagram', request.platformVideoId)) return null;
    return `https://www.instagram.com/reel/${request.platformVideoId}/`;
  }
}
