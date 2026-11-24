import { type AssetVersionView } from '@studio/shared/api';
import { videoLinkFrom, videoPostUrl, type VideoPost } from './video-link';

/** Route handler that serves a post's thumbnail from the studio's own origin (`img-src 'self'`). */
export const VIDEO_THUMBNAIL_PATH = '/api/miniaturas';

/**
 * The Instagram, YouTube or TikTok post a saved reference points at (docs/specs/2026-11-23-reference-link-save-and-categories-design.md
 * T4): only a `reference` whose provenance URL passes the same allowlist parser as the link box.
 */
export function referencePostOf(version: AssetVersionView): VideoPost | null {
  const source = version.provenance?.source;
  if (version.kind !== 'reference' || source?.type !== 'url') return null;
  const link = videoLinkFrom(source.url);
  return link.status === 'supported' ? link.post : null;
}

/** Same-origin address of the post's thumbnail; the server re-parses `link` with `videoLinkFrom`. */
export function videoThumbnailHref(post: VideoPost): string {
  return `${VIDEO_THUMBNAIL_PATH}?link=${encodeURIComponent(videoPostUrl(post))}`;
}
