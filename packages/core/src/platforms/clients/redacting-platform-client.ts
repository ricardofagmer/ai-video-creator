import { type Platform, type PlatformCapability } from '@studio/shared/platforms';
import { type RevealedRedactableValue } from '../../secrets/secret';
import { type SecretToken, type TokenBundle } from '../token-bundle';
import { type PlatformClients } from './platform-client.registry';
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
} from './platform-client.port';

/** Where revealed tokens are registered; `SecretsService` in production, read by the redactor. */
export interface RevealedTokenRegistry {
  registerRevealedValue(value: RevealedRedactableValue): void;
}

function registerBundle(registry: RevealedTokenRegistry, bundle: TokenBundle): void {
  registry.registerRevealedValue(bundle.accessToken);
  if (bundle.refreshToken !== null) registry.registerRevealedValue(bundle.refreshToken);
}

/**
 * Finding S4 (SPEC 0007 section 5.2: tokens are covered by the redactor). Every token a platform
 * call reveals or receives is registered with the redactor before the call that uses it: the
 * bundle passed in, the authorization code and verifier, and the bundle an exchange or a refresh
 * returns, before the caller can use or log it. It forwards every call unchanged otherwise.
 */
class RedactingPlatformClient implements PlatformClient {
  readonly platform: Platform;
  readonly mode: PlatformClient['mode'];
  readonly pkce: PlatformClient['pkce'];

  constructor(
    private readonly inner: PlatformClient,
    private readonly registry: RevealedTokenRegistry,
  ) {
    this.platform = inner.platform;
    this.mode = inner.mode;
    this.pkce = inner.pkce;
  }

  scopesFor(capabilities: readonly PlatformCapability[]): string[] {
    return this.inner.scopesFor(capabilities);
  }

  authorizeUrl(request: AuthorizeUrlRequest): string {
    return this.inner.authorizeUrl(request);
  }

  async exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    this.registerTokens([request.code, request.verifier]);
    const bundle = await this.inner.exchangeCode(request);
    registerBundle(this.registry, bundle);
    return bundle;
  }

  fetchIdentity(tokens: TokenBundle): Promise<PlatformIdentity> {
    registerBundle(this.registry, tokens);
    return this.inner.fetchIdentity(tokens);
  }

  async refresh(tokens: TokenBundle, credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    registerBundle(this.registry, tokens);
    const refreshed = await this.inner.refresh(tokens, credentials, now);
    registerBundle(this.registry, refreshed);
    return refreshed;
  }

  revoke(tokens: TokenBundle, credentials: PlatformClientCredentials | null): Promise<void> {
    registerBundle(this.registry, tokens);
    return this.inner.revoke(tokens, credentials);
  }

  upload(request: UploadRequest): Promise<UploadOutcome> {
    registerBundle(this.registry, request.tokens);
    return this.inner.upload(request);
  }

  uploadStatus(request: UploadStatusRequest): Promise<UploadStatus> {
    registerBundle(this.registry, request.tokens);
    return this.inner.uploadStatus(request);
  }

  fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    registerBundle(this.registry, request.tokens);
    return this.inner.fetchMetrics(request);
  }

  publicationUrl(request: { platformVideoId: string; accountLabel: string }): string | null {
    return this.inner.publicationUrl(request);
  }

  private registerTokens(tokens: readonly SecretToken[]): void {
    for (const token of tokens) this.registry.registerRevealedValue(token);
  }
}

/**
 * The production `PLATFORM_CLIENTS`: the registry's clients, each wrapped once so its tokens reach
 * the redactor. Tests bind their own `PlatformClients` and see unwrapped clients.
 */
export class RedactingPlatformClients implements PlatformClients {
  private readonly wrapped = new Map<Platform, PlatformClient>();

  constructor(
    private readonly inner: PlatformClients,
    private readonly registry: RevealedTokenRegistry,
  ) {}

  clientFor(platform: Platform): PlatformClient {
    const known = this.wrapped.get(platform);
    if (known !== undefined) return known;
    const client = new RedactingPlatformClient(this.inner.clientFor(platform), this.registry);
    this.wrapped.set(platform, client);
    return client;
  }
}
