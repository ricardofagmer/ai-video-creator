import { type AssetKind } from '@studio/shared/catalog';
import { type StudioArtwork } from '@/features/common/studio-artwork';

/** Glyph and gradient tone of a cart tile, per asset kind, in the Skills page's visual language. */
export const cartKindArtwork: Record<AssetKind, StudioArtwork> = {
  template: { glyph: 'film', tone: 'sunset' },
  'ai-model': { glyph: 'motion', tone: 'violet' },
  reference: { glyph: 'magnifier', tone: 'dusk' },
  prompt: { glyph: 'script', tone: 'flame' },
  skill: { glyph: 'clapperboard', tone: 'magenta' },
  image: { glyph: 'camera', tone: 'sunset' },
  music: { glyph: 'waveform', tone: 'magenta' },
  sfx: { glyph: 'megaphone', tone: 'flame' },
  'brand-kit': { glyph: 'palette', tone: 'dusk' },
};
