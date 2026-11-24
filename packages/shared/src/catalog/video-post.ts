/**
 * The one allowlist parser of video post links (Instagram, YouTube, TikTok), shared by the web's
 * link box, the api's analysis policy and the watcher's download
 * (docs/specs/2026-11-24-link-reference-analysis-design.md). Pure and browser-safe.
 */

/** The platforms whose posts a reference link may point at. */
export type VideoPlatform = 'instagram' | 'youtube' | 'tiktok';

/** Instagram's post paths: a feed post, a reel, or an IGTV video. */
export type InstagramPostFormat = 'p' | 'reel' | 'tv';

/** One parsed post; only these parts, never the pasted text, reach the DOM, a stored link or a tool. */
export type VideoPost =
  | { platform: 'instagram'; format: InstagramPostFormat; id: string }
  | { platform: 'youtube'; format: 'video' | 'short'; id: string }
  | { platform: 'tiktok'; format: 'video'; id: string; user: string };

export type VideoLink = { status: 'absent' } | { status: 'supported'; post: VideoPost } | { status: 'unsupported' };

const MAX_LINK_LENGTH = 500;
const INSTAGRAM_HOSTS: ReadonlySet<string> = new Set(['instagram.com', 'www.instagram.com']);
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const TIKTOK_HOSTS: ReadonlySet<string> = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']);
const INSTAGRAM_PATH = /^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,40})\/?$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH = /^\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/;
const YOUTU_BE_PATH = /^\/([A-Za-z0-9_-]{11})\/?$/;
const TIKTOK_PATH = /^\/@([A-Za-z0-9._]{1,40})\/video\/([0-9]{8,25})\/?$/;

function instagramFormatFrom(value: string | undefined): InstagramPostFormat | null {
  return value === 'p' || value === 'reel' || value === 'tv' ? value : null;
}

function instagramPostFrom(path: string): VideoPost | null {
  const match = INSTAGRAM_PATH.exec(path);
  const format = instagramFormatFrom(match?.[1]);
  const id = match?.[2];
  return format === null || id === undefined ? null : { platform: 'instagram', format, id };
}

function youtubePostFrom(url: URL): VideoPost | null {
  if (url.hostname === 'youtu.be') {
    const id = YOUTU_BE_PATH.exec(url.pathname)?.[1];
    return id === undefined ? null : { platform: 'youtube', format: 'video', id };
  }
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return YOUTUBE_ID.test(id) ? { platform: 'youtube', format: 'video', id } : null;
  }
  const match = YOUTUBE_PATH.exec(url.pathname);
  const id = match?.[2];
  if (id === undefined) return null;
  return { platform: 'youtube', format: match?.[1] === 'shorts' ? 'short' : 'video', id };
}

function tiktokPostFrom(path: string): VideoPost | null {
  const match = TIKTOK_PATH.exec(path);
  const user = match?.[1];
  const id = match?.[2];
  return user === undefined || id === undefined ? null : { platform: 'tiktok', format: 'video', id, user };
}

function videoPostOf(url: URL): VideoPost | null {
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  if (INSTAGRAM_HOSTS.has(url.hostname)) return instagramPostFrom(url.pathname);
  if (YOUTUBE_HOSTS.has(url.hostname) || url.hostname === 'youtu.be') return youtubePostFrom(url);
  if (TIKTOK_HOSTS.has(url.hostname)) return tiktokPostFrom(url.pathname);
  return null;
}

/**
 * Accepts `https://` links to an Instagram post, reel or IGTV video; a YouTube video (`watch?v=`,
 * `youtu.be/`, `/embed/`, `/live/`) or Short; or a TikTok video (`/@user/video/<id>`). The text is
 * untrusted: it is parsed with `URL`, the host must be on the allowlist and the ids must match their
 * shapes, and only the parsed parts leave this function.
 */
export function videoLinkFrom(value: string): VideoLink {
  const text = value.trim();
  if (text === '') return { status: 'absent' };
  if (text.length > MAX_LINK_LENGTH || !URL.canParse(text)) return { status: 'unsupported' };
  const post = videoPostOf(new URL(text));
  return post === null ? { status: 'unsupported' } : { status: 'supported', post };
}

/** The post's canonical address, rebuilt from the parsed parts so a link never carries pasted extras. */
export function videoPostUrl(post: VideoPost): string {
  switch (post.platform) {
    case 'instagram':
      return `https://www.instagram.com/${post.format}/${post.id}/`;
    case 'youtube':
      return post.format === 'short' ? `https://www.youtube.com/shorts/${post.id}` : `https://www.youtube.com/watch?v=${post.id}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${post.user}/video/${post.id}`;
  }
}
