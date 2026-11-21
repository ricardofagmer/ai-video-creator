import { type FileHandle } from 'node:fs/promises';
import { type Platform, type PlatformCapability } from '@studio/shared/platforms';
import { type PlatformMockFault } from '../../platform-modes.config';
import { type PkceChallengeEncoding } from '../../oauth/pkce';
import { type TokenBundle } from '../../token-bundle';
import { PlatformClientError, type PlatformClientOperation } from '../platform-client.errors';
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
import {
  MOCK_ACCOUNT_LABEL,
  MOCK_AUTHORIZATION_CODE,
  mockAccessExpiresAt,
  mockMetrics,
  mockPlatformAccountId,
  mockRefreshExpiresAt,
  mockToken,
} from './mock-data';

/** Chunk size of the mock upload's disk read; the bytes are read and counted, never sent. */
const MOCK_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

/** What differs between the three mock clients; everything else is shared below. */
export interface MockPlatformProfile {
  platform: Platform;
  pkce: PkceChallengeEncoding;
  identityScopes: readonly string[];
  capabilityScopes: Readonly<Record<PlatformCapability, readonly string[]>>;
  /** The platform's answer once the last byte is read; null where publishing is unsupported (OD8). */
  finishUpload(attemptId: string, now: Date): UploadOutcome | null;
  /** The status check that follows `processing` or `sent-to-inbox`. */
  statusAfterUpload(uploadRef: string, now: Date): UploadStatus;
  publicationUrl(platformVideoId: string): string | null;
  /** Whether a refresh replaces the refresh token too (TikTok rotates it, section 5.2). */
  rotatesRefreshToken: boolean;
}

/**
 * The offline client of one platform (SPEC 0007 section 5.8). It makes no request: connect points
 * the browser back at the api's callback with `MOCK_AUTHORIZATION_CODE`, the upload reads the bytes
 * through the caller's handle to count them and sends nothing (finding S2: never by path), metrics
 * are `mockMetrics` and stop when the pass budget's signal aborts (finding C7).
 * The fault scenario of `VIDEO_STUDIO_PLATFORM_<PLATFORM>_MOCK_FAULT` makes the calls fail as
 * section 5.8 lists.
 */
export class MockPlatformClient implements PlatformClient {
  readonly mode = 'mock';
  readonly platform: Platform;
  readonly pkce: PkceChallengeEncoding;

  constructor(
    private readonly profile: MockPlatformProfile,
    private readonly fault: PlatformMockFault,
  ) {
    this.platform = profile.platform;
    this.pkce = profile.pkce;
  }

  scopesFor(capabilities: readonly PlatformCapability[]): string[] {
    const scopes = [...this.profile.identityScopes, ...capabilities.flatMap((capability) => this.profile.capabilityScopes[capability])];
    return [...new Set(scopes)];
  }

  authorizeUrl(request: AuthorizeUrlRequest): string {
    const url = new URL(request.redirectUri);
    url.searchParams.set('code', MOCK_AUTHORIZATION_CODE);
    url.searchParams.set('state', request.state);
    return url.toString();
  }

  async exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    if (request.code.revealForPlatformCall() !== MOCK_AUTHORIZATION_CODE) throw this.failure('exchange', 'exchange-failed');
    return {
      format: 1,
      platform: this.platform,
      connectionId: request.connectionId,
      accessToken: mockToken('access'),
      accessExpiresAt: mockAccessExpiresAt(request.now),
      refreshToken: mockToken('refresh'),
      refreshExpiresAt: mockRefreshExpiresAt(request.now),
      scopes: this.scopesFor(['metrics', 'publish']),
      obtainedAt: request.now.toISOString(),
    };
  }

  async fetchIdentity(): Promise<PlatformIdentity> {
    return { accountLabel: MOCK_ACCOUNT_LABEL, platformAccountId: mockPlatformAccountId(this.platform) };
  }

  async refresh(tokens: TokenBundle, _credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    if (this.fault === 'token-revoked') throw this.failure('refresh', 'token-revoked');
    return {
      ...tokens,
      accessToken: mockToken('access'),
      accessExpiresAt: mockAccessExpiresAt(now),
      refreshToken: this.profile.rotatesRefreshToken ? mockToken('refresh') : tokens.refreshToken,
      refreshExpiresAt: this.profile.rotatesRefreshToken ? mockRefreshExpiresAt(now) : tokens.refreshExpiresAt,
      obtainedAt: now.toISOString(),
    };
  }

  async revoke(): Promise<void> {
    return undefined;
  }

  async upload(request: UploadRequest): Promise<UploadOutcome> {
    this.throwCallFault('upload');
    const finished = this.profile.finishUpload(request.attemptId, request.now);
    if (finished === null) throw this.failure('upload', 'account-not-eligible');
    const stopAfter = this.fault === 'upload-fails' ? Math.floor(request.sizeBytes / 2) : request.sizeBytes;
    const bytesRead = await this.readFile(request.file, stopAfter, request.onProgress);
    if (this.fault === 'upload-fails') throw this.failure('upload', 'media-rejected');
    if (bytesRead !== request.sizeBytes) throw this.failure('upload', 'media-rejected');
    if (this.fault === 'outcome-unknown') throw this.failure('upload', 'outcome-unknown');
    return finished;
  }

  async uploadStatus(request: UploadStatusRequest): Promise<UploadStatus> {
    if (this.fault === 'token-revoked') throw this.failure('upload-status', 'token-revoked');
    return this.profile.statusAfterUpload(request.uploadRef, request.now);
  }

  async fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    this.throwIfAborted(request.signal);
    this.throwCallFault('metrics');
    const results: MetricResult[] = [];
    for (const target of request.targets) {
      // Each target stands for one request; the port says a client stops at a request boundary.
      this.throwIfAborted(request.signal);
      results.push({
        publicationId: target.publicationId,
        status: 'ok',
        metrics: mockMetrics(this.platform, target.publicationId, target.dayIndex),
        platformMediaId: target.platformMediaId,
      });
    }
    return results;
  }

  publicationUrl(request: { platformVideoId: string; accountLabel: string }): string | null {
    return this.profile.publicationUrl(request.platformVideoId);
  }

  /** Port contract (finding C7): an aborted pass rejects with `network`; partial results are dropped. */
  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw this.failure('metrics', 'network');
  }

  private throwCallFault(operation: PlatformClientOperation): void {
    if (this.fault === 'token-revoked') throw this.failure(operation, 'token-revoked');
    if (this.fault === 'rate-limited') throw this.failure(operation, 'rate-limited');
    if (this.fault === 'quota-exhausted') throw this.failure(operation, 'quota-exhausted');
  }

  private failure(operation: PlatformClientOperation, reason: ConstructorParameters<typeof PlatformClientError>[2]): PlatformClientError {
    return new PlatformClientError(this.platform, operation, reason);
  }

  /**
   * Reads up to `limit` bytes in chunks through the caller's handle, from position 0, as a real
   * upload streams them. The caller opened the file and closes it (finding S2).
   */
  private async readFile(file: FileHandle, limit: number, onProgress: (bytesSent: number) => void): Promise<number> {
    const buffer = Buffer.alloc(Math.min(MOCK_UPLOAD_CHUNK_BYTES, Math.max(limit, 1)));
    let total = 0;
    while (total < limit) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, limit - total), total);
      if (bytesRead === 0) break;
      total += bytesRead;
      onProgress(total);
    }
    return total;
  }
}
