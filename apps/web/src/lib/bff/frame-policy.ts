/** Whether a page may be shown inside a studio page, read from the page's own response headers. */
export type FramePolicy = 'allowed' | 'blocked';

/** Header values as Node gives them: absent, one string, or one string per repeated header. */
type HeaderValue = string | string[] | undefined;

function valuesOf(header: HeaderValue): string[] {
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

/** The `frame-ancestors` source lists of every CSP header that has one. */
function frameAncestorLists(csp: HeaderValue): string[][] {
  return valuesOf(csp)
    .flatMap((value) => value.split(','))
    .flatMap((policy) => policy.split(';'))
    .map((directive) => directive.trim().split(/\s+/))
    .filter(([name]) => name?.toLowerCase() === 'frame-ancestors')
    .map(([, ...sources]) => sources.map((source) => source.toLowerCase()));
}

/**
 * The studio is served from a loopback `http:` origin, so only a source that admits any http page, or
 * that loopback origin itself, lets it frame the page. Every list must admit it: CSP policies combine.
 */
function listAdmitsStudio(sources: readonly string[], studioOrigin: URL): boolean {
  const host = studioOrigin.host.toLowerCase();
  return sources.some(
    (source) =>
      source === '*' ||
      source === 'http:' ||
      source === `http://${host}` ||
      source === `http://${studioOrigin.hostname.toLowerCase()}:*`,
  );
}

/**
 * Browsers follow CSP `frame-ancestors` when a page sends it and ignore `X-Frame-Options` then; without
 * it any `X-Frame-Options` value (DENY, SAMEORIGIN, the obsolete ALLOW-FROM) keeps the studio out.
 */
export function framePolicyOf(headers: { csp: HeaderValue; xFrameOptions: HeaderValue }, studioOrigin: URL): FramePolicy {
  const lists = frameAncestorLists(headers.csp);
  if (lists.length > 0) return lists.every((sources) => listAdmitsStudio(sources, studioOrigin)) ? 'allowed' : 'blocked';
  return valuesOf(headers.xFrameOptions).some((value) => value.trim() !== '') ? 'blocked' : 'allowed';
}
