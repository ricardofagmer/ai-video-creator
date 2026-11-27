import { BlockedError } from '@studio/shared/ace';

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/i;

/** The first http(s) URL named in a scene's visual brief, if any. */
export function extractCaptureUrl(visual: string): URL | null {
  const match = URL_PATTERN.exec(visual);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[.,;:!?]+$/, ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const PRIVATE_IPV4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
// Link-local (cloud metadata) and the unspecified network.
const REFUSED_IPV4 = [/^169\.254\./, /^0\./];

/** This machine and private-network literals: reachable only when the owner typed that host. */
function isLocalNetworkHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  return PRIVATE_IPV4.some((pattern) => pattern.test(hostname));
}

/** Never a capture target, allowlisted or not: link-local addresses and IPv6 literals. */
function isRefusedHost(hostname: string): boolean {
  return hostname.startsWith('[') || REFUSED_IPV4.some((pattern) => pattern.test(hostname));
}

/**
 * A navigation target: its host is on the allowlist (the host the owner typed as the source URL).
 * Public hosts must be https; a local-network host may also be plain http, because a local
 * development server rarely has a certificate (owner decision, 2026-11-24).
 */
export function isHostAllowed(url: URL, allowedHosts: readonly string[]): boolean {
  const hostname = url.hostname.toLowerCase();
  if (isRefusedHost(hostname) || !allowedHosts.includes(hostname)) return false;
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLocalNetworkHost(hostname));
}

/**
 * Sub-requests of a captured page (images, scripts, fetch/XHR, media) may use any public CDN, so
 * they skip the host allowlist, but they still must be https, carry no credentials and stay off
 * loopback, link-local and private-network addresses. A local page's own assets pass through
 * `isHostAllowed` instead.
 */
export function isPublicHttpsUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  const hostname = url.hostname.toLowerCase();
  return !isLocalNetworkHost(hostname) && !isRefusedHost(hostname);
}

/** Whether research and capture read this owner-typed source URL at all. */
export function isReadableSourceUrl(sourceUrl: string): boolean {
  if (!URL.canParse(sourceUrl)) return false;
  const url = new URL(sourceUrl);
  return url.username === '' && url.password === '' && isHostAllowed(url, [url.hostname.toLowerCase()]);
}

/** Checks every capture target up front so no browser time is spent before a refusal. */
export function assertCaptureTargetsAllowed(targets: readonly { sceneId: string; url: URL }[], allowedHosts: readonly string[]): void {
  const refused = targets.filter((target) => !isHostAllowed(target.url, allowedHosts) || target.url.username || target.url.password);
  if (refused.length === 0) return;
  const listing = refused.map((target) => `scene "${target.sceneId}": ${target.url.hostname}`).join('; ');
  const allowed = allowedHosts.length > 0 ? allowedHosts.join(', ') : '(none configured)';
  throw new BlockedError(`capture targets not on CAPTURE_ALLOWED_HOSTS [${allowed}]: ${listing}`, 'CAPTURE_NOT_ALLOWED');
}
