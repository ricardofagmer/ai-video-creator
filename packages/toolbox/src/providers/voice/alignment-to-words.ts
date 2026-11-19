import type { WordTiming } from '@studio/shared/ace';

export interface CharacterAlignment {
  characters: readonly string[];
  character_start_times_seconds: readonly number[];
  character_end_times_seconds: readonly number[];
}

/**
 * Maps ElevenLabs character timestamps to word timings: a word is a maximal run of
 * non-whitespace characters, starting at its first character and ending at its last.
 */
export function alignmentToWords(alignment: CharacterAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let text = '';
  let startS = 0;
  let endS = 0;
  const flush = (): void => {
    if (text) words.push({ text, startS, endS: Math.max(startS, endS) });
    text = '';
  };
  alignment.characters.forEach((character, index) => {
    if (/\s/.test(character)) {
      flush();
      return;
    }
    const characterStart = alignment.character_start_times_seconds[index] ?? endS;
    const characterEnd = alignment.character_end_times_seconds[index] ?? characterStart;
    if (!text) startS = Math.max(0, characterStart);
    text += character;
    endS = characterEnd;
  });
  flush();
  return words;
}
