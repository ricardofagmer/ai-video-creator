import type { WordTiming } from '@studio/shared/ace';

export interface CaptionLine {
  words: WordTiming[];
  startS: number;
  endS: number;
}

const MAX_WORDS_PER_LINE = 4;
const LINE_BREAK_GAP_S = 0.5;
/** How long a finished line stays visible when the next line has not started yet. */
const LINE_HOLD_S = 0.7;
const SENTENCE_END = /[.,!?;:]$/;

/** Groups narration word timings into short caption lines (max 4 words, broken at pauses and punctuation). */
export function groupCaptionLines(words: readonly WordTiming[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: WordTiming[] = [];

  const flush = (): void => {
    const first = current[0];
    const last = current[current.length - 1];
    if (first && last) {
      lines.push({ words: current, startS: first.startS, endS: last.endS });
    }
    current = [];
  };

  words.forEach((word, index) => {
    const previous = words[index - 1];
    const pauseBefore = previous !== undefined && word.startS - previous.endS > LINE_BREAK_GAP_S;
    if (pauseBefore) {
      flush();
    }
    current.push(word);
    if (current.length >= MAX_WORDS_PER_LINE || SENTENCE_END.test(word.text.trim())) {
      flush();
    }
  });
  flush();

  return lines;
}

/** Returns the line to show at `timeS`, or undefined during silences. */
export function findActiveLine(lines: readonly CaptionLine[], timeS: number): CaptionLine | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && line.startS <= timeS) {
      const next = lines[index + 1];
      const holdUntil = line.endS + LINE_HOLD_S;
      const visibleUntil = next ? Math.min(next.startS, holdUntil) : holdUntil;
      return timeS < visibleUntil ? line : undefined;
    }
  }
  return undefined;
}

/** Index of the most recently spoken word in the line; stays on it through short gaps. */
export function activeWordIndex(line: CaptionLine, timeS: number): number {
  let active = 0;
  line.words.forEach((word, index) => {
    if (word.startS <= timeS) {
      active = index;
    }
  });
  return active;
}
