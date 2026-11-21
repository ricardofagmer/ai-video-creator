import { SecretToken, type TokenBundle } from '../../token-bundle';
import { PlatformClientError, type PlatformClientOperation } from '../platform-client.errors';
import { type AuthorizeUrlRequest, type CodeExchangeRequest, type PlatformClientCredentials } from '../platform-client.port';
import { TIKTOK_AUTHORIZE_URL, TIKTOK_REVOKE_URL, TIKTOK_TOKEN_URL } from './tiktok-endpoints';
import { oauthFailure } from './tiktok-failures';
import { JSON_CALL_TIMEOUT_MS, parseJsonText, type TiktokAnswer, type TiktokHttp } from './tiktok-http';
import { OAuthErrorSchema, parseGrantedScopes, RevokeSuccessSchema, TokenSuccessSchema, type TokenSuccess } from './tiktok-schemas';

/*
 * Login Kit for Desktop [T1] and token management [T2]: the authorize URL with PKCE S256 (hex
 * challenge, built by `pkceChallenge`), the code exchange with the client secret and verifier, the
 * rotating refresh, and the revoke. Every secret goes in a form-encoded POST body, never in a URL
 * (K3); the authorize URL carries only the public client key, the redirect, `state` and challenge.
 */

const FORM_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Type': 'application/x-www-form-urlencoded',
  'Cache-Control': 'no-cache',
});

function requireCredentials(operation: PlatformClientOperation, credentials: PlatformClientCredentials | null): PlatformClientCredentials {
  // Live mode always has credentials: the api refuses a connect with `not-configured` before this.
  if (credentials === null) throw new PlatformClientError('tiktok', operation, 'exchange-failed');
  return credentials;
}

/** The authorize page URL; TikTok requires PKCE, so a missing challenge is refused. */
export function buildAuthorizeUrl(request: AuthorizeUrlRequest): string {
  const credentials = requireCredentials('authorize-url', request.credentials);
  if (request.challenge === null) throw new PlatformClientError('tiktok', 'authorize-url', 'exchange-failed');
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set('client_key', credentials.clientId.revealForProviderCall());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', request.scopes.join(','));
  url.searchParams.set('redirect_uri', request.redirectUri);
  url.searchParams.set('state', request.state);
  url.searchParams.set('code_challenge', request.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function addSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function readTokenSuccess(step: 'exchange' | 'refresh', answer: TiktokAnswer, refreshExpired: boolean): TokenSuccess {
  if (answer.status !== 200 || answer.text === null) throw oauthFailure(step, answer, refreshExpired);
  const json = parseJsonText(answer.text);
  if (json.ok) {
    const parsed = TokenSuccessSchema.safeParse(json.value);
    if (parsed.success) return parsed.data;
    // A 200 can still carry an OAuth error body; it is mapped like any other error answer.
    if (OAuthErrorSchema.safeParse(json.value).success) throw oauthFailure(step, answer, refreshExpired);
  }
  throw new PlatformClientError('tiktok', step, 'invalid-response');
}

function grantedScopes(step: 'exchange' | 'refresh', token: TokenSuccess): string[] {
  const scopes = parseGrantedScopes(token.scope);
  if (scopes === null) throw new PlatformClientError('tiktok', step, 'invalid-response');
  return scopes;
}

export class TiktokOAuth {
  constructor(private readonly http: TiktokHttp) {}

  async exchangeCode(request: CodeExchangeRequest): Promise<TokenBundle> {
    const credentials = requireCredentials('exchange', request.credentials);
    const body = new URLSearchParams({
      client_key: credentials.clientId.revealForProviderCall(),
      client_secret: credentials.clientSecret.revealForProviderCall(),
      code: request.code.revealForPlatformCall(),
      grant_type: 'authorization_code',
      redirect_uri: request.redirectUri,
      code_verifier: request.verifier.revealForPlatformCall(),
    });
    const answer = await this.post('exchange', TIKTOK_TOKEN_URL, body);
    const token = readTokenSuccess('exchange', answer, false);
    return {
      format: 1,
      platform: 'tiktok',
      connectionId: request.connectionId,
      accessToken: new SecretToken(token.access_token),
      accessExpiresAt: addSeconds(request.now, token.expires_in),
      refreshToken: new SecretToken(token.refresh_token),
      refreshExpiresAt: addSeconds(request.now, token.refresh_expires_in),
      scopes: grantedScopes('exchange', token),
      obtainedAt: request.now.toISOString(),
    };
  }

  /**
   * [T2]: the answer's refresh token replaces the one sent, which TikTok invalidates at once. The
   * returned bundle always carries the new one (the schema requires it), and the watcher writes it
   * under `token.lock` before the new access token is used (section 5.2).
   */
  async refresh(tokens: TokenBundle, credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    const refreshExpired = tokens.refreshExpiresAt !== null && Date.parse(tokens.refreshExpiresAt) <= now.getTime();
    if (tokens.refreshToken === null) throw new PlatformClientError('tiktok', 'refresh', 'refresh-expired');
    const resolved = requireCredentials('refresh', credentials);
    const body = new URLSearchParams({
      client_key: resolved.clientId.revealForProviderCall(),
      client_secret: resolved.clientSecret.revealForProviderCall(),
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken.revealForPlatformCall(),
    });
    const answer = await this.post('refresh', TIKTOK_TOKEN_URL, body);
    const token = readTokenSuccess('refresh', answer, refreshExpired);
    return {
      ...tokens,
      accessToken: new SecretToken(token.access_token),
      accessExpiresAt: addSeconds(now, token.expires_in),
      refreshToken: new SecretToken(token.refresh_token),
      refreshExpiresAt: addSeconds(now, token.refresh_expires_in),
      scopes: grantedScopes('refresh', token),
      obtainedAt: now.toISOString(),
    };
  }

  /** Revokes the access token; best effort, so the caller ignores a failure (section 5.2). */
  async revoke(tokens: TokenBundle, credentials: PlatformClientCredentials | null): Promise<void> {
    const resolved = requireCredentials('revoke', credentials);
    const body = new URLSearchParams({
      client_key: resolved.clientId.revealForProviderCall(),
      client_secret: resolved.clientSecret.revealForProviderCall(),
      token: tokens.accessToken.revealForPlatformCall(),
    });
    const answer = await this.post('revoke', TIKTOK_REVOKE_URL, body);
    if (answer.status !== 200 || answer.text === null) throw oauthFailure('revoke', answer, false);
    if (answer.text.trim() === '') return;
    const json = parseJsonText(answer.text);
    if (!json.ok || !RevokeSuccessSchema.safeParse(json.value).success) throw oauthFailure('revoke', answer, false);
  }

  private post(operation: 'exchange' | 'refresh' | 'revoke', url: string, body: URLSearchParams): Promise<TiktokAnswer> {
    return this.http.send({
      operation,
      url: new URL(url),
      method: 'POST',
      headers: { ...FORM_HEADERS },
      body: body.toString(),
      timeoutMs: JSON_CALL_TIMEOUT_MS,
    });
  }
}
