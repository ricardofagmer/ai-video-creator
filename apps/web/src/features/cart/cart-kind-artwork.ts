import { type AssetKind } from '@studio/shared/catalog';
import { type SkillGlyphName, type SkillTone } from '@/features/skills/skill-artwork';

export interface CartKindArtwork {
  glyph: SkillGlyphName;
  tone: SkillTone;
}

/** Glyph and gradient tone of a cart tile, per asset kind, in the Skills page's visual language. */
export const cartKindArtwork: Record<AssetKind, CartKindArtwork> = {
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
