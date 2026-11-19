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

const PRIVATE_IPV4 = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];

/** Loopback, link-local and private-network literals are never capture targets, allowlisted or not. */
function isLocalNetworkHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname.startsWith('[')) return true;
  return PRIVATE_IPV4.some((pattern) => pattern.test(hostname));
}

export function isHostAllowed(url: URL, allowedHosts: readonly string[]): boolean {
  if (url.protocol !== 'https:') return false;
  const hostname = url.hostname.toLowerCase();
  return !isLocalNetworkHost(hostname) && allowedHosts.includes(hostname);
}

/** Checks every capture target up front so no browser time is spent before a refusal. */
export function assertCaptureTargetsAllowed(targets: readonly { sceneId: string; url: URL }[], allowedHosts: readonly string[]): void {
  const refused = targets.filter((target) => !isHostAllowed(target.url, allowedHosts) || target.url.username || target.url.password);
  if (refused.length === 0) return;
  const listing = refused.map((target) => `scene "${target.sceneId}": ${target.url.hostname}`).join('; ');
  const allowed = allowedHosts.length > 0 ? allowedHosts.join(', ') : '(none configured)';
  throw new BlockedError(`capture targets not on CAPTURE_ALLOWED_HOSTS [${allowed}]: ${listing}`, 'CAPTURE_NOT_ALLOWED');
}
