import { type Platform, type PlatformCapability, type PlatformMode } from '@studio/shared/platforms';
import { MockPlatformClient } from './clients/mock/mock-platform-client';
import { mockPlatformProfiles } from './clients/mock/mock-profiles';
import { type PlatformClients } from './clients/platform-client.registry';
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
} from './clients/platform-client.port';
import { type PkceChallengeEncoding } from './oauth/pkce';
import { type PlatformModeSettings } from './platform-modes.config';
import { type TokenBundle } from './token-bundle';
import { SENTINEL_AUTHORIZATION_CODE, SENTINEL_CLIENT_ID, SENTINEL_CLIENT_SECRET, sentinelTokenBundle } from './token-fixtures.harness.test';

/*
 * Test-only platform client that stands in for a delivered live client (SPEC 0007 AC 39 to AC 42,
 * AC 60): it makes no request, hands back the sentinel code and sentinel tokens, and records what
 * the handlers asked of it. It implements the port by composition over the offline mock client, so
 * every recorded call keeps the port's full signature. With `LIVE_YOUTUBE_MODES` and
 * `SENTINEL_CREDENTIAL_ENVIRONMENT` the connect path takes its live branch (credentials looked up,
 * the vault written) entirely offline. Helpers only: the `.harness.test.ts` name marks a test
 * support file; it declares no test.
 */

export const LIVE_YOUTUBE_MODES: PlatformModeSettings = {
  youtube: { mode: 'live' },
  instagram: { mode: 'mock', fault: 'none' },
  tiktok: { mode: 'mock', fault: 'none' },
};

/** Sentinel OAuth client credentials, as the environment would supply them; no real value. */
export const SENTINEL_CREDENTIAL_ENVIRONMENT: Record<string, string> = {
  YOUTUBE_OAUTH_CLIENT_ID: SENTINEL_CLIENT_ID,
  YOUTUBE_OAUTH_CLIENT_SECRET: SENTINEL_CLIENT_SECRET,
};

export class RecordingClient implements PlatformClient {
  readonly platform: Platform;
  readonly mode: PlatformMode;
  readonly pkce: PkceChallengeEncoding;
  readonly authorizeRequests: AuthorizeUrlRequest[] = [];
  readonly exchangeRequests: CodeExchangeRequest[] = [];
  readonly revokeCalls: { tokens: TokenBundle; credentials: PlatformClientCredentials | null }[] = [];
  private readonly offline: MockPlatformClient;

  constructor(platform: Platform) {
    this.offline = new MockPlatformClient(mockPlatformProfiles[platform], 'none');
    this.platform = this.offline.platform;
    this.mode = this.offline.mode;
    this.pkce = this.offline.pkce;
  }

  scopesFor(capabilities: readonly PlatformCapability[]): string[] {
    return this.offline.scopesFor(capabilities);
  }

  authorizeUrl(request: AuthorizeUrlRequest): string {
    this.authorizeRequests.push(request);
    const url = new URL(request.redirectUri);
    url.searchParams.set('code', SENTINEL_AUTHORIZATION_CODE);
    url.searchParams.set('state', request.state);
    return url.toString();
  }

  async exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    this.exchangeRequests.push(request);
    if (request.code.revealForPlatformCall() !== SENTINEL_AUTHORIZATION_CODE) return this.offline.exchangeCode(request);
    return sentinelTokenBundle(this.platform, {
      connectionId: request.connectionId,
      scopes: this.offline.scopesFor(['metrics', 'publish']),
      obtainedAt: request.now.toISOString(),
    });
  }

  fetchIdentity(): Promise<PlatformIdentity> {
    return this.offline.fetchIdentity();
  }

  refresh(tokens: TokenBundle, credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    return this.offline.refresh(tokens, credentials, now);
  }

  async revoke(tokens: TokenBundle, credentials: PlatformClientCredentials | null): Promise<void> {
    this.revokeCalls.push({ tokens, credentials });
  }

  upload(request: UploadRequest): Promise<UploadOutcome> {
    return this.offline.upload(request);
  }

  uploadStatus(request: UploadStatusRequest): Promise<UploadStatus> {
    return this.offline.uploadStatus(request);
  }

  fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    return this.offline.fetchMetrics(request);
  }

  publicationUrl(request: { platformVideoId: string; accountLabel: string }): string | null {
    return this.offline.publicationUrl(request);
  }
}

/** One recording client per platform, whatever the mode says. */
export class RecordingClients implements PlatformClients {
  readonly youtube = new RecordingClient('youtube');
  readonly instagram = new RecordingClient('instagram');
  readonly tiktok = new RecordingClient('tiktok');

  clientFor(platform: Platform): RecordingClient {
    return this[platform];
  }
}
