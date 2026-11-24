import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alignmentToWords, type CharacterAlignment } from '../providers/voice/alignment-to-words';

/* CR12 (ticket 10): ElevenLabs character timestamps folded into word timings. */

/** One character every 0.1 s, each lasting 0.1 s, starting at `startS`. */
function evenAlignment(text: string, startS = 0): CharacterAlignment {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => Math.round((startS + index * 0.1) * 1000) / 1000),
    character_end_times_seconds: characters.map((_, index) => Math.round((startS + (index + 1) * 0.1) * 1000) / 1000),
  };
}

describe('toolbox alignmentToWords (CR12)', () => {
  it('makes one word per run of non-whitespace, from its first start to its last end', () => {
    assert.deepEqual(alignmentToWords(evenAlignment('oi mundo')), [
      { text: 'oi', startS: 0, endS: 0.2 },
      { text: 'mundo', startS: 0.3, endS: 0.8 },
    ]);
  });

  it('treats repeated, leading and trailing whitespace as separators only', () => {
    const words = alignmentToWords(evenAlignment(' a \n b '));

    assert.deepEqual(
      words.map((word) => word.text),
      ['a', 'b'],
    );
  });

  it('keeps punctuation attached to its word', () => {
    assert.deepEqual(
      alignmentToWords(evenAlignment('olá, mundo!')).map((word) => word.text),
      ['olá,', 'mundo!'],
    );
  });

  it('clamps a negative start to zero', () => {
    const [word] = alignmentToWords({ characters: ['a', 'b'], character_start_times_seconds: [-0.05, 0.1], character_end_times_seconds: [0.1, 0.2] });

    assert.equal(word?.startS, 0);
  });

  it('never ends a word before it starts', () => {
    const [word] = alignmentToWords({ characters: ['a', 'b'], character_start_times_seconds: [0.5, 0.6], character_end_times_seconds: [0.55, 0.4] });

    assert.deepEqual(word, { text: 'ab', startS: 0.5, endS: 0.5 });
  });

  it('fills missing timestamps from the previous character instead of failing', () => {
    const words = alignmentToWords({ characters: ['a', 'b', 'c'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1] });

    assert.deepEqual(words, [{ text: 'abc', startS: 0, endS: 0.1 }]);
  });

  it('returns no words for an empty or all-whitespace alignment', () => {
    assert.deepEqual(alignmentToWords(evenAlignment('')), []);
    assert.deepEqual(alignmentToWords(evenAlignment('   ')), []);
  });
});
