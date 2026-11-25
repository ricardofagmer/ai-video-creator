/**
 * Owner-typed links (image links, site links, the checkout site) are untrusted input: only an absolute
 * `https:` URL with a host and no credentials passes; anything else returns null.
 */
export function httpsUrlFrom(text: string, maxLength: number): URL | null {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > maxLength || !URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '' ? url : null;
}

const PRIVATE_IPV4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
const REFUSED_IPV4 = [/^169\.254\./, /^0\./];

function isLocalNetworkHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || PRIVATE_IPV4.some((pattern) => pattern.test(host));
}

/**
 * The run's source URL, by the same rule as the watcher's capture guard (toolbox `capture-url`), so
 * the form refuses up front what research and capture would refuse later: `https:` on any host, or
 * `http:` on this machine or the private network; never link-local or an IPv6 literal.
 */
export function sourceUrlFrom(text: string, maxLength: number): URL | null {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > maxLength || !URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  const host = url.hostname.toLowerCase();
  if (host === '' || url.username !== '' || url.password !== '') return null;
  if (host.startsWith('[') || REFUSED_IPV4.some((pattern) => pattern.test(host))) return null;
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLocalNetworkHost(host)) ? url : null;
}
