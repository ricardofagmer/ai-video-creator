import { metricsBounds, platformVideoIdPatterns } from './constants';
import { type Platform } from './enums';

/*
 * `parsePublicationUrl` (SPEC 0006 section 5.1): pure, no I/O, browser-safe. A published URL is
 * parsed and rebuilt, never fetched (K6, no SSRF): only allowlisted hosts and anchored paths pass,
 * and the stored URL is rebuilt from the parsed parts so no query string, fragment or other
 * owner-typed text is kept.
 */

/** Hosts whose links need a request to resolve; K6 forbids the request, so they are refused. */
export const shortLinkHosts: readonly string[] = Object.freeze([
  'vm.tiktok.com',
  'vt.tiktok.com',
  'instagr.am',
  'bit.ly',
  't.co',
  'tinyurl.com',
  'goo.gl',
]);

const youtubeHosts: readonly string[] = ['www.youtube.com', 'youtube.com', 'm.youtube.com'];
const youtubeShortHost = 'youtu.be';
const instagramHosts: readonly string[] = ['www.instagram.com', 'instagram.com'];
const tiktokHosts: readonly string[] = ['www.tiktok.com', 'tiktok.com'];

/** A TikTok handle kept in the canonical URL (section 5.1). */
export const tiktokHandlePattern = /^[A-Za-z0-9._]{1,24}$/;

const youtubeShortsPath = /^\/shorts\/([A-Za-z0-9_-]+)\/?$/;
const youtubeShortHostPath = /^\/([A-Za-z0-9_-]+)\/?$/;
const instagramPath = /^\/(reel|reels|p)\/([A-Za-z0-9_-]+)\/?$/;
const tiktokVideoPath = /^\/@([A-Za-z0-9._]+)\/video\/([0-9]+)\/?$/;
/** `tiktok.com/t/<code>` is TikTok's in-host short form; it resolves only through a request. */
const tiktokShortPath = /^\/t\/[^/]+\/?$/;

/** Refusal reasons are the C10 rev 5 `ApiError.reason` values the api answers with (422). */
export type PublicationUrlRefusal = 'publication-url-not-recognized' | 'publication-short-link-refused';

export type ParsedPublicationUrl =
  | { status: 'recognized'; platform: Platform; platformVideoId: string; url: string }
  | { status: 'refused'; reason: PublicationUrlRefusal };

const notRecognized: ParsedPublicationUrl = { status: 'refused', reason: 'publication-url-not-recognized' };
const shortLink: ParsedPublicationUrl = { status: 'refused', reason: 'publication-short-link-refused' };

/** True when `value` is a whole platform video id for `platform` (section 4.2 patterns). */
export function isPlatformVideoId(platform: Platform, value: string): boolean {
  return platformVideoIdPatterns[platform].test(value);
}

function recognized(platform: Platform, platformVideoId: string, url: string): ParsedPublicationUrl {
  if (!isPlatformVideoId(platform, platformVideoId)) return notRecognized;
  return { status: 'recognized', platform, platformVideoId, url };
}

function parseYoutube(url: URL): ParsedPublicationUrl {
  if (url.pathname === '/watch') {
    const watchIds = url.searchParams.getAll('v');
    const watchId = watchIds[0];
    if (watchIds.length !== 1 || watchId === undefined) return notRecognized;
    return recognized('youtube', watchId, `https://www.youtube.com/watch?v=${watchId}`);
  }
  const id = youtubeShortsPath.exec(url.pathname)?.[1];
  if (id === undefined) return notRecognized;
  return recognized('youtube', id, `https://www.youtube.com/shorts/${id}`);
}

function parseYoutubeShortHost(url: URL): ParsedPublicationUrl {
  const id = youtubeShortHostPath.exec(url.pathname)?.[1];
  if (id === undefined) return notRecognized;
  return recognized('youtube', id, `https://youtu.be/${id}`);
}

function parseInstagram(url: URL): ParsedPublicationUrl {
  const match = instagramPath.exec(url.pathname);
  const kind = match?.[1];
  const code = match?.[2];
  if (kind === undefined || code === undefined) return notRecognized;
  return recognized('instagram', code, `https://www.instagram.com/${kind}/${code}/`);
}

function parseTiktok(url: URL): ParsedPublicationUrl {
  if (tiktokShortPath.test(url.pathname)) return shortLink;
  const match = tiktokVideoPath.exec(url.pathname);
  const handle = match?.[1];
  const id = match?.[2];
  if (handle === undefined || id === undefined || !tiktokHandlePattern.test(handle)) return notRecognized;
  return recognized('tiktok', id, `https://www.tiktok.com/@${handle}/video/${id}`);
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    // An unparseable string is simply not a recognized link; the reason is the answer.
    return null;
  }
}

/**
 * Recognizes a published video URL (section 5.1): `https` only, no credentials, no port, host in
 * the allowlist, path matched by one anchored pattern; the query string and fragment are dropped
 * except YouTube `v`. Short-link hosts answer `publication-short-link-refused`; everything else
 * that does not match answers `publication-url-not-recognized`.
 */
export function parsePublicationUrl(raw: string): ParsedPublicationUrl {
  const text = raw.trim();
  if (text.length === 0 || text.length > metricsBounds.urlChars) return notRecognized;
  const url = parseUrl(text);
  if (url === null) return notRecognized;
  if (shortLinkHosts.includes(url.hostname)) return shortLink;
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return notRecognized;
  if (youtubeHosts.includes(url.hostname)) return parseYoutube(url);
  if (url.hostname === youtubeShortHost) return parseYoutubeShortHost(url);
  if (instagramHosts.includes(url.hostname)) return parseInstagram(url);
  if (tiktokHosts.includes(url.hostname)) return parseTiktok(url);
  return notRecognized;
}
