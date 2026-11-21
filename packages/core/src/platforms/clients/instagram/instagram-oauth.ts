import { SecretToken, type TokenBundle } from '../../token-bundle';
import { PlatformClientError, type PlatformClientOperation } from '../platform-client.errors';
import {
  type AuthorizeUrlRequest,
  type CodeExchangeRequest,
  type PlatformClientCredentials,
  type PlatformIdentity,
} from '../platform-client.port';
import { INSTAGRAM_HOSTS, INSTAGRAM_KNOWN_SCOPES, INSTAGRAM_PATHS } from './instagram.constants';
import { type InstagramHttp } from './instagram-http';
import {
  IdentityResponseSchema,
  LongLivedTokenResponseSchema,
  ShortLivedTokenResponseSchema,
  type ShortLivedTokenResponse,
} from './instagram.schemas';

/*
 * Instagram Login (SPEC 0007 section 5.2, [M2], U4): authorize on `www.instagram.com`, exchange the
 * code on `api.instagram.com` with the required app secret, then exchange the 1-hour token for the
 * long-lived one on `graph.instagram.com` and refresh it there. There is no PKCE and no refresh
 * token: the long-lived access token re-extends itself, so the bundle's refresh fields are null and
 * the expiry is always the `expires_in` the platform returned.
 */

/** [M2]: the redirect appends `#_`, which is not part of the code (it matters for a pasted address). */
const CODE_FRAGMENT_SUFFIX = '#_';

function requireCredentials(credentials: PlatformClientCredentials | null, operation: PlatformClientOperation): PlatformClientCredentials {
  // Live mode always resolves both credentials first (`not-configured` otherwise, section 5.3).
  if (credentials === null) throw new PlatformClientError('instagram', operation, 'exchange-failed');
  return credentials;
}

function expiresAt(now: Date, expiresInSeconds: number): string {
  return new Date(now.getTime() + expiresInSeconds * 1_000).toISOString();
}

/** The granted scopes the studio knows; anything else Instagram lists is not kept. */
function grantedScopes(permissions: string | readonly string[]): string[] {
  const names = typeof permissions === 'string' ? permissions.split(',') : permissions;
  const granted = new Set(names.map((name) => name.trim()));
  return INSTAGRAM_KNOWN_SCOPES.filter((scope) => granted.has(scope));
}

function shortLivedGrant(response: ShortLivedTokenResponse): { accessToken: string; permissions: string | readonly string[] } {
  if ('data' in response) {
    const [grant] = response.data;
    // The schema demands exactly one entry; this keeps the compiler and the parse in agreement.
    if (grant === undefined) throw new PlatformClientError('instagram', 'exchange', 'invalid-response');
    return { accessToken: grant.access_token, permissions: grant.permissions };
  }
  return { accessToken: response.access_token, permissions: response.permissions };
}

/** The browser URL; `state` is the flow's own value and the scopes are the section 5.2 minimum. */
export function instagramAuthorizeUrl(request: AuthorizeUrlRequest): string {
  const credentials = requireCredentials(request.credentials, 'authorize-url');
  const url = new URL(`https://${INSTAGRAM_HOSTS.authorize}${INSTAGRAM_PATHS.authorize}`);
  url.searchParams.set('client_id', credentials.clientId.revealForProviderCall());
  url.searchParams.set('redirect_uri', request.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', request.scopes.join(','));
  url.searchParams.set('state', request.state);
  return url.toString();
}

/** Code to short-lived token to long-lived token; both calls must succeed or nothing is returned. */
export async function exchangeInstagramCode(http: InstagramHttp, request: CodeExchangeRequest): Promise<TokenBundle> {
  const credentials = requireCredentials(request.credentials, 'exchange');
  const rawCode = request.code.revealForPlatformCall();
  const code = rawCode.endsWith(CODE_FRAGMENT_SUFFIX) ? rawCode.slice(0, -CODE_FRAGMENT_SUFFIX.length) : rawCode;
  const shortLived = await http.sendParsed(
    {
      operation: 'exchange',
      method: 'POST',
      host: 'codeExchange',
      path: INSTAGRAM_PATHS.codeExchange,
      form: {
        client_id: credentials.clientId.revealForProviderCall(),
        client_secret: credentials.clientSecret.revealForProviderCall(),
        grant_type: 'authorization_code',
        redirect_uri: request.redirectUri,
        code,
      },
    },
    ShortLivedTokenResponseSchema,
  );
  const grant = shortLivedGrant(shortLived);
  /*
   * [M2] documents this exchange as a GET with `client_secret` and `access_token` in the query.
   * K3 and the ticket forbid a token or the secret in a URL, so both go in a POST form body; the
   * AC 63 owner run confirms Instagram accepts it (reported to the supervisor).
   */
  const longLived = await http.sendParsed(
    {
      operation: 'exchange',
      method: 'POST',
      host: 'graph',
      path: INSTAGRAM_PATHS.longLivedExchange,
      form: {
        grant_type: 'ig_exchange_token',
        client_secret: credentials.clientSecret.revealForProviderCall(),
        access_token: grant.accessToken,
      },
    },
    LongLivedTokenResponseSchema,
  );
  return {
    format: 1,
    platform: 'instagram',
    connectionId: request.connectionId,
    accessToken: new SecretToken(longLived.access_token),
    accessExpiresAt: expiresAt(request.now, longLived.expires_in),
    refreshToken: null,
    refreshExpiresAt: null,
    scopes: grantedScopes(grant.permissions),
    obtainedAt: request.now.toISOString(),
  };
}

/**
 * Re-extends the long-lived token [M2]: allowed once it is 24 h old and still valid; each refresh
 * gives a new 60-day token. [M2] puts the token in the query; it goes in the header here (K3).
 */
export async function refreshInstagramToken(http: InstagramHttp, tokens: TokenBundle, now: Date): Promise<TokenBundle> {
  const refreshed = await http.sendParsed(
    {
      operation: 'refresh',
      method: 'GET',
      host: 'graph',
      path: INSTAGRAM_PATHS.refresh,
      query: { grant_type: 'ig_refresh_token' },
      bearer: tokens.accessToken,
    },
    LongLivedTokenResponseSchema,
  );
  return {
    ...tokens,
    accessToken: new SecretToken(refreshed.access_token),
    accessExpiresAt: expiresAt(now, refreshed.expires_in),
    refreshToken: null,
    refreshExpiresAt: null,
    obtainedAt: now.toISOString(),
  };
}

/** One identity call: the professional account id and its @handle (shown, never logged, K7). */
export async function fetchInstagramIdentity(http: InstagramHttp, tokens: TokenBundle): Promise<PlatformIdentity> {
  const identity = await http.sendParsed(
    {
      operation: 'identity',
      method: 'GET',
      host: 'graph',
      path: INSTAGRAM_PATHS.identity,
      query: { fields: 'user_id,username' },
      bearer: tokens.accessToken,
    },
    IdentityResponseSchema,
  );
  return { accountLabel: `@${identity.username}`, platformAccountId: identity.user_id };
}
