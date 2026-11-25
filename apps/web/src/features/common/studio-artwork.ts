/**
 * The studio's decorative picture language: one media glyph and one colour tone per card, banner
 * or tile. It is decoration only; names and labels always say what a thing is.
 */
export const studioGlyphNames = [
  'camera',
  'waveform',
  'scissors',
  'motion',
  'chart',
  'upload',
  'check',
  'megaphone',
  'script',
  'film',
  'clapperboard',
  'palette',
  'magnifier',
  'reel',
  'calendar',
  'compare',
  'user',
  'play',
  'sparkles',
] as const;
export type StudioGlyphName = (typeof studioGlyphNames)[number];

/** Each tone is two neighbouring stops of the brand gradient. */
export type StudioTone = 'sunset' | 'flame' | 'magenta' | 'violet' | 'dusk';

export interface StudioArtwork {
  glyph: StudioGlyphName;
  tone: StudioTone;
}

const glyphTones: Record<StudioGlyphName, StudioTone> = {
  camera: 'violet',
  waveform: 'magenta',
  scissors: 'flame',
  motion: 'dusk',
  chart: 'dusk',
  upload: 'sunset',
  check: 'magenta',
  megaphone: 'flame',
  script: 'sunset',
  film: 'violet',
  clapperboard: 'flame',
  palette: 'sunset',
  magnifier: 'dusk',
  reel: 'violet',
  calendar: 'sunset',
  compare: 'dusk',
  user: 'magenta',
  play: 'flame',
  sparkles: 'violet',
};

/** The glyph with its usual tone. */
export function studioArtworkOf(glyph: StudioGlyphName): StudioArtwork {
  return { glyph, tone: glyphTones[glyph] };
}

const tones: readonly StudioTone[] = ['sunset', 'flame', 'magenta', 'violet', 'dusk'];

/** A stable tone picked from a text (an id or a name), so neighbouring cards of one glyph still differ. */
export function studioToneOf(text: string): StudioTone {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return tones[hash % tones.length] ?? 'flame';
}
