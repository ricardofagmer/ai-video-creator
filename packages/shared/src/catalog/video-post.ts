/**
 * The one allowlist parser of video post links, shared by the web's link box, the api's analysis
 * policy and the watcher's download (docs/specs/2026-11-24-link-reference-analysis-design.md).
 * Pure and browser-safe. Each platform has a fixed host list, a strict path shape and an official
 * embed; a link to any other site stays unsupported, so the server never fetches an arbitrary host.
 */

/** The platforms whose posts a reference link may point at. */
export type VideoPlatform = 'instagram' | 'youtube' | 'tiktok' | 'vimeo' | 'dailymotion' | 'facebook' | 'x' | 'twitch';

/** Instagram's post paths: a feed post, a reel, or an IGTV video. */
export type InstagramPostFormat = 'p' | 'reel' | 'tv';

/** One parsed post; only these parts, never the pasted text, reach the DOM, a stored link or a tool. */
export type VideoPost =
  | { platform: 'instagram'; format: InstagramPostFormat; id: string }
  | { platform: 'youtube'; format: 'video' | 'short'; id: string }
  | { platform: 'tiktok'; format: 'video'; id: string; user: string }
  | { platform: 'vimeo'; format: 'video'; id: string }
  | { platform: 'dailymotion'; format: 'video'; id: string }
  | { platform: 'facebook'; format: 'video' | 'reel'; id: string }
  | { platform: 'x'; format: 'post'; id: string; user: string }
  | { platform: 'twitch'; format: 'clip' | 'video'; id: string };

export type VideoLink = { status: 'absent' } | { status: 'supported'; post: VideoPost } | { status: 'unsupported' };

const MAX_LINK_LENGTH = 500;
const INSTAGRAM_HOSTS: ReadonlySet<string> = new Set(['instagram.com', 'www.instagram.com']);
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const TIKTOK_HOSTS: ReadonlySet<string> = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']);
const VIMEO_HOSTS: ReadonlySet<string> = new Set(['vimeo.com', 'www.vimeo.com']);
const DAILYMOTION_HOSTS: ReadonlySet<string> = new Set(['dailymotion.com', 'www.dailymotion.com']);
const FACEBOOK_HOSTS: ReadonlySet<string> = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com']);
const X_HOSTS: ReadonlySet<string> = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
const TWITCH_HOSTS: ReadonlySet<string> = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv']);

// A user segment before the post (`/name/reel/<id>`) and the plural `reels` are accepted.
const INSTAGRAM_PATH = /^(?:\/[A-Za-z0-9._]{1,30})?\/(p|reels?|tv)\/([A-Za-z0-9_-]{5,40})\/?$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH = /^\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/;
const YOUTU_BE_PATH = /^\/([A-Za-z0-9_-]{11})\/?$/;
const TIKTOK_PATH = /^\/@([A-Za-z0-9._]{1,40})\/video\/([0-9]{8,25})\/?$/;
const VIMEO_PATH = /^(?:\/channels\/[A-Za-z0-9_-]{1,60})?\/([0-9]{6,12})\/?$/;
const VIMEO_PLAYER_PATH = /^\/video\/([0-9]{6,12})\/?$/;
const DAILYMOTION_ID = /^x[A-Za-z0-9]{4,12}$/;
const DAILYMOTION_PATH = /^\/(?:embed\/)?video\/(x[A-Za-z0-9]{4,12})(?:_[^/]*)?\/?$/;
const DAI_LY_PATH = /^\/(x[A-Za-z0-9]{4,12})\/?$/;
const FACEBOOK_ID = /^[0-9]{6,25}$/;
const FACEBOOK_REEL_PATH = /^\/reel\/([0-9]{6,25})\/?$/;
const FACEBOOK_PAGE_VIDEO_PATH = /^\/[A-Za-z0-9.\-]{1,80}\/videos\/(?:[A-Za-z0-9.\-]{1,120}\/)?([0-9]{6,25})\/?$/;
const X_PATH = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{6,25})(?:\/video\/[1-4])?\/?$/;
const TWITCH_CLIP_SLUG = /^[A-Za-z0-9_-]{4,100}$/;
const TWITCH_CLIPS_HOST_PATH = /^\/([A-Za-z0-9_-]{4,100})\/?$/;
const TWITCH_CLIP_PATH = /^\/[A-Za-z0-9_]{1,25}\/clip\/([A-Za-z0-9_-]{4,100})\/?$/;
const TWITCH_VIDEO_PATH = /^\/videos\/([0-9]{6,15})\/?$/;

function instagramFormatFrom(value: string | undefined): InstagramPostFormat | null {
  if (value === 'reels') return 'reel';
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

function vimeoPostFrom(url: URL): VideoPost | null {
  const id = (url.hostname === 'player.vimeo.com' ? VIMEO_PLAYER_PATH : VIMEO_PATH).exec(url.pathname)?.[1];
  return id === undefined ? null : { platform: 'vimeo', format: 'video', id };
}

function dailymotionPostFrom(url: URL): VideoPost | null {
  const id = (url.hostname === 'dai.ly' ? DAI_LY_PATH : DAILYMOTION_PATH).exec(url.pathname)?.[1];
  return id === undefined || !DAILYMOTION_ID.test(id) ? null : { platform: 'dailymotion', format: 'video', id };
}

function facebookPostFrom(url: URL): VideoPost | null {
  if (url.pathname === '/watch' || url.pathname === '/watch/') {
    const id = url.searchParams.get('v') ?? '';
    return FACEBOOK_ID.test(id) ? { platform: 'facebook', format: 'video', id } : null;
  }
  const reel = FACEBOOK_REEL_PATH.exec(url.pathname)?.[1];
  if (reel !== undefined) return { platform: 'facebook', format: 'reel', id: reel };
  const video = FACEBOOK_PAGE_VIDEO_PATH.exec(url.pathname)?.[1];
  return video === undefined ? null : { platform: 'facebook', format: 'video', id: video };
}

function xPostFrom(path: string): VideoPost | null {
  const match = X_PATH.exec(path);
  const user = match?.[1];
  const id = match?.[2];
  return user === undefined || id === undefined ? null : { platform: 'x', format: 'post', id, user };
}

function twitchPostFrom(url: URL): VideoPost | null {
  if (url.hostname === 'clips.twitch.tv') {
    const slug = TWITCH_CLIPS_HOST_PATH.exec(url.pathname)?.[1];
    return slug === undefined || slug === 'embed' ? null : { platform: 'twitch', format: 'clip', id: slug };
  }
  const clip = TWITCH_CLIP_PATH.exec(url.pathname)?.[1];
  if (clip !== undefined && TWITCH_CLIP_SLUG.test(clip)) return { platform: 'twitch', format: 'clip', id: clip };
  const video = TWITCH_VIDEO_PATH.exec(url.pathname)?.[1];
  return video === undefined ? null : { platform: 'twitch', format: 'video', id: video };
}

function videoPostOf(url: URL): VideoPost | null {
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  const host = url.hostname;
  if (INSTAGRAM_HOSTS.has(host)) return instagramPostFrom(url.pathname);
  if (YOUTUBE_HOSTS.has(host) || host === 'youtu.be') return youtubePostFrom(url);
  if (TIKTOK_HOSTS.has(host)) return tiktokPostFrom(url.pathname);
  if (VIMEO_HOSTS.has(host) || host === 'player.vimeo.com') return vimeoPostFrom(url);
  if (DAILYMOTION_HOSTS.has(host) || host === 'dai.ly') return dailymotionPostFrom(url);
  if (FACEBOOK_HOSTS.has(host)) return facebookPostFrom(url);
  if (X_HOSTS.has(host)) return xPostFrom(url.pathname);
  if (TWITCH_HOSTS.has(host) || host === 'clips.twitch.tv') return twitchPostFrom(url);
  return null;
}

/**
 * Accepts `https://` links to a video post on one of the listed platforms:
 * - Instagram post, reel or IGTV video;
 * - YouTube video (`watch?v=`, `youtu.be/`, `/embed/`, `/live/`) or Short;
 * - TikTok video (`/@user/video/<id>`);
 * - Vimeo video;
 * - Dailymotion video;
 * - Facebook video, watch link or reel;
 * - X (Twitter) post;
 * - Twitch clip or past broadcast.
 *
 * The text is untrusted: it is parsed with `URL`, the host must be on the allowlist and the ids must
 * match their shapes, and only the parsed parts leave this function.
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
    case 'vimeo':
      return `https://vimeo.com/${post.id}`;
    case 'dailymotion':
      return `https://www.dailymotion.com/video/${post.id}`;
    case 'facebook':
      return post.format === 'reel' ? `https://www.facebook.com/reel/${post.id}` : `https://www.facebook.com/watch/?v=${post.id}`;
    case 'x':
      return `https://x.com/${post.user}/status/${post.id}`;
    case 'twitch':
      return post.format === 'clip' ? `https://clips.twitch.tv/${post.id}` : `https://www.twitch.tv/videos/${post.id}`;
  }
}

/** A stable key per post, so a new link remounts its form with fresh defaults. */
export function videoPostKey(post: VideoPost): string {
  return `${post.platform}/${post.format}/${post.id}`;
}
