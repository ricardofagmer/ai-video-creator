import { SESSION_COOKIE_NAME } from '@studio/shared/api';
import { SESSION_TTL_MS } from './session-store';

/** A browser may send a few same-named cookies (other paths); more is not a real client. */
const MAX_CANDIDATES = 4;

/**
 * Session cookie values from a `Cookie` header. Parsed by hand to avoid a dependency for a
 * single name: `name=value` pairs split on `;`, exact name match, no decoding (the token is
 * base64url).
 */
export function sessionTokensFrom(cookieHeader: string | undefined): string[] {
  if (cookieHeader === undefined || cookieHeader.length > 8192) return [];
  const tokens: string[] = [];
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    tokens.push(pair.slice(separator + 1).trim());
    if (tokens.length >= MAX_CANDIDATES) break;
  }
  return tokens;
}

/**
 * httpOnly (no script can read it) and `SameSite=Lax` (D8, ADR 0001). Not `Secure`: the api is
 * plain HTTP on 127.0.0.1, where a `Secure` cookie is not reliably stored or sent by every
 * browser; confidentiality rests on the loopback-only listener instead (criterion 23).
 */
export function serializeSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
