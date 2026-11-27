import 'server-only';
import { z } from 'zod';
import { videoPostKey, videoPostUrl, type VideoPost } from '@/features/catalog/video-link';

export interface ThumbnailImage {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/** Thumbnails only ever come from these hosts, the start URL and every redirect alike. */
const EXACT_HOSTS = new Set(['www.instagram.com', 'i.ytimg.com', 'www.tiktok.com', 'vimeo.com', 'i.vimeocdn.com', 'www.dailymotion.com']);
const HOST_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net', '.tiktokcdn.com', '.tiktokcdn-us.com', '.dmcdn.net'];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_OEMBED_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;
const HOP_TIMEOUT_MS = 8_000;
/** CDN links expire, so the bytes are kept rather than the URL; failures are retried sooner. */
const SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
const USER_AGENT = 'Mozilla/5.0 (compatible; VideoStudio/1.0)';

const OEmbedThumbnailSchema = z.object({ thumbnail_url: z.string().max(2048) });

interface CacheEntry {
  image: ThumbnailImage | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ThumbnailImage | null>>();

class ThumbnailFetchError extends Error {
  constructor(reason: string) {
    super(`Thumbnail fetch refused: ${reason}`);
    this.name = 'ThumbnailFetchError';
  }
}

function hostAllowed(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** GET that follows at most MAX_REDIRECTS redirects, each one checked against the host allowlist. */
async function fetchFromAllowedHosts(start: string, accept: string): Promise<Response> {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!hostAllowed(url)) throw new ThumbnailFetchError(`host ${url.hostname} is not allowed`);
    const response = await fetch(url, {
      headers: { Accept: accept, 'User-Agent': USER_AGENT },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || location === null) return response;
    await response.body?.cancel();
    url = new URL(location, url);
  }
  throw new ThumbnailFetchError('too many redirects');
}

/** Reads the body, refusing anything larger than `limit` bytes before it is fully buffered. */
async function readCapped(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > limit) throw new ThumbnailFetchError('body too large');
  if (response.body === null) throw new ThumbnailFetchError('empty body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ThumbnailFetchError('body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchImage(url: string): Promise<ThumbnailImage> {
  const response = await fetchFromAllowedHosts(url, 'image/webp,image/jpeg,image/png;q=0.9');
  if (!response.ok) throw new ThumbnailFetchError(`status ${response.status}`);
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!IMAGE_TYPES.has(contentType)) throw new ThumbnailFetchError(`content type ${contentType}`);
  return { bytes: await readCapped(response, MAX_IMAGE_BYTES), contentType };
}

/** TikTok and Vimeo have no stable thumbnail URL; their public oEmbed answer names a CDN image. */
async function oembedThumbnailUrl(endpoint: string, post: VideoPost): Promise<string> {
  const oembed = `${endpoint}?url=${encodeURIComponent(videoPostUrl(post))}`;
  const response = await fetchFromAllowedHosts(oembed, 'application/json');
  if (!response.ok) throw new ThumbnailFetchError(`oEmbed status ${response.status}`);
  const body: unknown = JSON.parse(new TextDecoder().decode(await readCapped(response, MAX_OEMBED_BYTES)));
  return OEmbedThumbnailSchema.parse(body).thumbnail_url;
}

/**
 * The image to fetch, or null for platforms with no thumbnail reachable without an API key or a
 * login (Facebook, X, Twitch); the page then shows the placeholder.
 */
async function sourceImageUrl(post: VideoPost): Promise<string | null> {
  switch (post.platform) {
    case 'instagram':
      return `https://www.instagram.com/${post.format}/${post.id}/media/?size=m`;
    case 'youtube':
      return `https://i.ytimg.com/vi/${post.id}/hqdefault.jpg`;
    case 'tiktok':
      return oembedThumbnailUrl('https://www.tiktok.com/oembed', post);
    case 'vimeo':
      return oembedThumbnailUrl('https://vimeo.com/api/oembed.json', post);
    case 'dailymotion':
      return `https://www.dailymotion.com/thumbnail/video/${post.id}`;
    case 'facebook':
    case 'x':
    case 'twitch':
      return null;
  }
}

async function loadFromSource(post: VideoPost): Promise<ThumbnailImage | null> {
  try {
    const source = await sourceImageUrl(post);
    return source === null ? null : await fetchImage(source);
  } catch (error) {
    // A missing thumbnail is not an error for the page: the route answers with a placeholder.
    console.warn(`[thumbnails] ${videoPostKey(post)}: ${error instanceof Error ? error.message : 'unknown failure'}`);
    return null;
  }
}

function remember(key: string, image: ThumbnailImage | null): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { image, expiresAt: Date.now() + (image === null ? FAILURE_TTL_MS : SUCCESS_TTL_MS) });
}

/** The post's thumbnail, from the in-memory cache or its platform; null when it cannot be fetched. */
export async function loadVideoThumbnail(post: VideoPost): Promise<ThumbnailImage | null> {
  const key = videoPostKey(post);
  const cached = cache.get(key);
  if (cached !== undefined && cached.expiresAt > Date.now()) return cached.image;
  const running = inFlight.get(key);
  if (running !== undefined) return running;
  const loading = loadFromSource(post)
    .then((image) => {
      remember(key, image);
      return image;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, loading);
  return loading;
}
