import type { WordTiming } from '@studio/shared/ace';

/** Synthesised speech leaves a short gap before the first phoneme and after the last one. */
const DEFAULT_EDGE_S = 0.06;
const WORD_FILL_RATIO = 0.92;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Spreads a clip's duration over its words by character weight, for voices that return no
 * timings. `offsetS` places the clip inside a longer narration.
 */
export function estimateWordTimings(text: string, durationS: number, offsetS = 0): WordTiming[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const span = Math.max(0.1, durationS - DEFAULT_EDGE_S * 2);
  const weights = words.map((word) => word.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = offsetS + DEFAULT_EDGE_S;
  return words.map((word, index) => {
    const length = (span * (weights[index] ?? 1)) / total;
    const timing = { text: word, startS: round(cursor), endS: round(cursor + length * WORD_FILL_RATIO) };
    cursor += length;
    return timing;
  });
}
