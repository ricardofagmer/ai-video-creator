import { videoSpec } from '@studio/shared/ace';

export const brand = videoSpec.brand;
export const safeZone = videoSpec.safeZone;

// No webfont dependency: the renderer's Chromium falls back through this stack.
export const fontFamily = 'Inter, "Helvetica Neue", "Segoe UI", Arial, sans-serif';

export const surface = '#13213A';
export const surfaceRaised = '#1A2B4A';
export const hairline = 'rgba(244, 247, 251, 0.12)';
export const accentSoft = 'rgba(46, 196, 182, 0.16)';

/** Vertical layout bands, in px, all inside the TikTok safe zone. */
export const layout = {
  progressTop: safeZone.topPx + 8,
  headerTop: safeZone.topPx + 44,
  mediaTop: 480,
  mediaBottom: 700,
  captionsBottom: safeZone.bottomPx + 100,
  disclosureBottom: safeZone.bottomPx + 16,
  left: safeZone.leftPx,
  right: safeZone.rightPx,
} as const;

/** Sample audio sentinel: Studio previews skip <Audio> for it so no asset is needed. */
export const SAMPLE_AUDIO_URL = 'https://example.invalid/ace-sample-narration.mp3';
