import { type PlatformCapability } from '@studio/shared/platforms';
import { SecretToken, type TokenBundle } from '../../token-bundle';
import { type AuthorizeUrlRequest, type CodeExchangeRequest, type PlatformClientCredentials } from '../platform-client.port';
import { oauthErrorReason } from './youtube-error-map';
import { discardBody, parseYoutubeBody, readJsonBody, retryAfterSeconds, sendYoutubeRequest, youtubeError } from './youtube-http';
import { GoogleTokenResponseSchema, type GoogleTokenResponse } from './youtube.schemas';
import {
  YOUTUBE_CAPABILITY_SCOPES,
  YOUTUBE_IDENTITY_SCOPES,
  YOUTUBE_KNOWN_SCOPES,
  youtubeEndpoints,
  youtubeTimeoutsMs,
} from './youtube.constants';

/*
 * OAuth for a Google Desktop client (SPEC 0007 section 5.2, [G1]): authorization code with PKCE
 * S256 (base64url) and `state`, code exchange and refresh on the token endpoint, revoke on
 * `oauth2.googleapis.com/revoke`. Codes, verifiers, tokens and the client secret travel only in POST
 * bodies; the authorize URL carries only public parameters (client id, redirect, scopes, `state`,
 * challenge), which the browser needs.
 */

/** Section 5.2 minimal scopes: identity plus those of the enabled capabilities, deduplicated. */
export function youtubeScopesFor(capabilities: readonly PlatformCapability[]): string[] {
  return [...new Set([...YOUTUBE_IDENTITY_SCOPES, ...capabilities.flatMap((capability) => YOUTUBE_CAPABILITY_SCOPES[capability])])];
}

/** The redirect must be the api's own loopback callback (section 5.2); anything else is refused. */
function isLoopbackRedirect(redirectUri: string): boolean {
  if (!URL.canParse(redirectUri)) return false;
  const url = new URL(redirectUri);
  return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.search === '' && url.hash === '';
}

/**
 * The browser URL of step 1. `access_type=offline` and `prompt=consent` make Google return a
 * refresh token on every connect, a reconnect included, so the watcher can keep the connection.
 */
export function youtubeAuthorizeUrl(request: AuthorizeUrlRequest): string {
  const { credentials, challenge, scopes } = request;
  if (credentials === null || challenge === null) throw youtubeError('authorize-url', 'exchange-failed');
  if (!isLoopbackRedirect(request.redirectUri)) throw youtubeError('authorize-url', 'exchange-failed');
  if (scopes.length === 0 || !scopes.every((scope) => YOUTUBE_KNOWN_SCOPES.includes(scope))) {
    throw youtubeError('authorize-url', 'scope-missing');
  }
  const url = new URL(youtubeEndpoints.authorize);
  url.searchParams.set('client_id', credentials.clientId.revealForProviderCall());
  url.searchParams.set('redirect_uri', request.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', request.state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

/** Granted scopes, kept only when they are ones this client asks for (so the bundle stays bounded). */
function grantedScopes(scope: string | undefined, fallback: readonly string[]): string[] {
  if (scope === undefined) return [...fallback];
  const granted = scope.split(' ').filter((entry) => YOUTUBE_KNOWN_SCOPES.includes(entry));
  return [...new Set(granted)];
}

function expiresAt(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

interface TokenCall {
  operation: 'exchange' | 'refresh';
  form: URLSearchParams;
  now: Date;
  /** True when the bundle being refreshed said its refresh token would be expired by now. */
  refreshExpired: boolean;
}

/** One POST to the token endpoint; errors become reason ids and the body is dropped. */
async function postToken(fetchFn: typeof fetch, call: TokenCall): Promise<GoogleTokenResponse> {
  const response = await sendYoutubeRequest(fetchFn, {
    operation: call.operation,
    url: new URL(youtubeEndpoints.token),
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: call.form.toString(),
    timeoutMs: youtubeTimeoutsMs.oauth,
  });
  if (!response.ok) {
    const body = await readJsonBody(response, call.operation);
    const reason = oauthErrorReason({ status: response.status, body, operation: call.operation, refreshExpired: call.refreshExpired });
    throw youtubeError(call.operation, reason, { retryAfterSeconds: retryAfterSeconds(response, call.now) });
  }
  return parseYoutubeBody(response, GoogleTokenResponseSchema, call.operation);
}

function clientForm(credentials: PlatformClientCredentials): URLSearchParams {
  // [G1]: the secret is optional for a Desktop client; it is sent because the owner configured one.
  return new URLSearchParams({
    client_id: credentials.clientId.revealForProviderCall(),
    client_secret: credentials.clientSecret.revealForProviderCall(),
  });
}

/** Step 2: the code and verifier for a bundle; a missing refresh token is a failed exchange. */
export async function exchangeYoutubeCode(fetchFn: typeof fetch, request: CodeExchangeRequest): Promise<TokenBundle> {
  if (request.credentials === null) throw youtubeError('exchange', 'exchange-failed');
  const form = clientForm(request.credentials);
  form.set('grant_type', 'authorization_code');
  form.set('code', request.code.revealForPlatformCall());
  form.set('code_verifier', request.verifier.revealForPlatformCall());
  form.set('redirect_uri', request.redirectUri);
  const answer = await postToken(fetchFn, { operation: 'exchange', form, now: request.now, refreshExpired: false });
  if (answer.refresh_token === undefined) throw youtubeError('exchange', 'exchange-failed');
  return {
    format: 1,
    platform: 'youtube',
    connectionId: request.connectionId,
    accessToken: new SecretToken(answer.access_token),
    accessExpiresAt: expiresAt(request.now, answer.expires_in),
    refreshToken: new SecretToken(answer.refresh_token),
    refreshExpiresAt: answer.refresh_token_expires_in === undefined ? null : expiresAt(request.now, answer.refresh_token_expires_in),
    scopes: grantedScopes(answer.scope, []),
    obtainedAt: request.now.toISOString(),
  };
}

/** A new access token; Google keeps the refresh token unless it returns a new one. */
export async function refreshYoutubeTokens(
  fetchFn: typeof fetch,
  tokens: TokenBundle,
  credentials: PlatformClientCredentials | null,
  now: Date,
): Promise<TokenBundle> {
  const refreshExpired = tokens.refreshExpiresAt !== null && Date.parse(tokens.refreshExpiresAt) <= now.getTime();
  if (tokens.refreshToken === null) throw youtubeError('refresh', 'refresh-expired');
  if (credentials === null) throw youtubeError('refresh', 'token-revoked');
  const form = clientForm(credentials);
  form.set('grant_type', 'refresh_token');
  form.set('refresh_token', tokens.refreshToken.revealForPlatformCall());
  const answer = await postToken(fetchFn, { operation: 'refresh', form, now, refreshExpired });
  const rotated = answer.refresh_token !== undefined;
  return {
    ...tokens,
    accessToken: new SecretToken(answer.access_token),
    accessExpiresAt: expiresAt(now, answer.expires_in),
    refreshToken: answer.refresh_token === undefined ? tokens.refreshToken : new SecretToken(answer.refresh_token),
    refreshExpiresAt:
      answer.refresh_token_expires_in !== undefined ? expiresAt(now, answer.refresh_token_expires_in) : rotated ? null : tokens.refreshExpiresAt,
    scopes: grantedScopes(answer.scope, tokens.scopes),
    obtainedAt: now.toISOString(),
  };
}

/**
 * Best-effort revoke at disconnect (section 5.2). Revoking the refresh token ends the whole grant.
 * The token goes in the POST body, not the query string [G1] shows, so no proxy or log keeps it.
 */
export async function revokeYoutubeTokens(fetchFn: typeof fetch, tokens: TokenBundle): Promise<void> {
  const token = tokens.refreshToken ?? tokens.accessToken;
  const response = await sendYoutubeRequest(fetchFn, {
    operation: 'revoke',
    url: new URL(youtubeEndpoints.revoke),
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: token.revealForPlatformCall() }).toString(),
    timeoutMs: youtubeTimeoutsMs.oauth,
  });
  // The success body is empty and the error body is never read: only the status matters here.
  await discardBody(response);
  if (response.ok) return;
  if (response.status === 429) throw youtubeError('revoke', 'rate-limited');
  throw youtubeError('revoke', response.status >= 500 ? 'platform-unavailable' : 'token-revoked');
}
