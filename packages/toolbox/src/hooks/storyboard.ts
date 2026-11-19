import type { HookLang, HookSection } from '@studio/shared/ace';

/** `atWord` is one word spoken in every language, or the word per language when they differ. */
export type ShotEvent = { atBeat: number } | { atWord: string | Record<HookLang, string>; occurrence?: number; offsetBeats?: number };

export interface ShotLine {
  text: Record<HookLang, string>;
  highlight: Record<HookLang, string | null>;
}

export interface ShotSpec {
  id: string;
  section: HookSection;
  /** The shot never gets shorter than this, even with a short or no line. */
  minBeats: number;
  /** Beats between the shot start and the first spoken word (default 1). */
  leadBeats?: number;
  /** Beats kept after the last word before the next shot (default 1). */
  tailBeats?: number;
  line?: ShotLine;
  events?: Record<string, ShotEvent>;
}

export interface Storyboard {
  id: string;
  bpm: number;
  /** Shot lengths are rounded up to a multiple of this many beats (2 = half bar in 4/4). */
  roundToBeats: number;
  shots: readonly ShotSpec[];
  copy: Record<HookLang, Record<string, string>>;
}
