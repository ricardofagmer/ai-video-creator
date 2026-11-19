import type { HookLine, WordTiming } from '@studio/shared/ace';

export interface CaptionChunk {
  words: WordTiming[];
  startS: number;
  endS: number;
  /** The one highlighted word (last occurrence in its narration line), when it falls in this chunk. */
  highlightWord: WordTiming | null;
}

const MAX_WORDS = 6;
const MAX_CHARS = 30;
/** A chunk stays on screen at least this long, so a short phrase can still be read. */
const MIN_ON_SCREEN_S = 1.1;
const HOLD_AFTER_S = 0.6;
const BREAK_AFTER = /[.,:;!?]$/;

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Splits narration lines into short caption phrases: one idea, at most two screen lines. */
export function chunkLines(lines: readonly HookLine[]): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];
  for (const line of lines) {
    let current: WordTiming[] = [];
    const target = line.highlight ? normalizeWord(line.highlight) : null;
    const highlightWord = target ? ([...line.words].reverse().find((word) => normalizeWord(word.text) === target) ?? null) : null;
    const flush = (): void => {
      const first = current[0];
      const last = current.at(-1);
      if (first && last) chunks.push({ words: current, startS: first.startS, endS: last.endS, highlightWord: highlightWord && current.includes(highlightWord) ? highlightWord : null });
      current = [];
    };
    line.words.forEach((word, index) => {
      const nextLength = [...current, word].map((item) => item.text).join(' ').length;
      if (current.length > 0 && (current.length >= MAX_WORDS || nextLength > MAX_CHARS)) flush();
      current.push(word);
      const isLast = index === line.words.length - 1;
      if (!isLast && BREAK_AFTER.test(word.text) && current.length >= 2) flush();
    });
    flush();
  }
  return chunks;
}

/** Visible window per chunk: never overlaps the next chunk, holds a little after speech. */
export function chunkWindow(chunks: readonly CaptionChunk[], index: number): { fromS: number; toS: number } {
  const chunk = chunks[index];
  const next = chunks[index + 1];
  if (!chunk) return { fromS: 0, toS: 0 };
  const wanted = Math.max(chunk.endS + HOLD_AFTER_S, chunk.startS + MIN_ON_SCREEN_S);
  return { fromS: chunk.startS - 0.08, toS: next ? Math.min(wanted, next.startS - 0.08) : wanted };
}
