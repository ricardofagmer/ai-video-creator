import { videoPostUrl, type VideoPost } from '@studio/shared/catalog';

// The parser is the shared allowlist one, so the link box, the api and the watcher accept the same links.
export { videoLinkFrom, videoPostKey, videoPostUrl, type InstagramPostFormat, type VideoLink, type VideoPlatform, type VideoPost } from '@studio/shared/catalog';

/**
 * How the embed is laid out: Instagram's post card sizes itself (header, video, footer), so its height
 * comes from the embed; Shorts, TikTok, Facebook reels and X posts are 9:16; the rest is 16:9.
 */
export type VideoEmbedShape = 'instagram-card' | 'vertical' | 'landscape';

/**
 * Each platform's official embed page; it runs in its own origin inside a sandboxed iframe. YouTube uses
 * its privacy-enhanced host, which sets no cookies until the video plays. Twitch refuses to play unless
 * `parent` names the host of the page that frames it.
 */
export function videoEmbedUrl(post: VideoPost, parentHost: string): string {
  switch (post.platform) {
    case 'instagram':
      return `https://www.instagram.com/${post.format}/${post.id}/embed/`;
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${post.id}`;
    case 'tiktok':
      return `https://www.tiktok.com/player/v1/${post.id}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${post.id}?dnt=1`;
    case 'dailymotion':
      return `https://www.dailymotion.com/embed/video/${post.id}`;
    case 'facebook':
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(videoPostUrl(post))}&show_text=false`;
    case 'x':
      return `https://platform.twitter.com/embed/Tweet.html?id=${post.id}&dnt=true`;
    case 'twitch': {
      const parent = encodeURIComponent(parentHost);
      return post.format === 'clip'
        ? `https://clips.twitch.tv/embed?clip=${encodeURIComponent(post.id)}&parent=${parent}&autoplay=false`
        : `https://player.twitch.tv/?video=${post.id}&parent=${parent}&autoplay=false`;
    }
  }
}

export function videoEmbedShape(post: VideoPost): VideoEmbedShape {
  switch (post.platform) {
    case 'instagram':
      return 'instagram-card';
    case 'youtube':
      return post.format === 'video' ? 'landscape' : 'vertical';
    case 'facebook':
      return post.format === 'reel' ? 'vertical' : 'landscape';
    case 'tiktok':
    case 'x':
      return 'vertical';
    case 'vimeo':
    case 'dailymotion':
    case 'twitch':
      return 'landscape';
  }
}
