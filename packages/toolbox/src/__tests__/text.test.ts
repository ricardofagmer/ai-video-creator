import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countWords, normalizeUrl, normalizeWhitespace, splitWords } from '../validation/text';

/* CR12 (ticket 10): the word and URL helpers the narration and claims rules count and compare with. */

describe('toolbox text helpers (CR12)', () => {
  it('splits words on any run of whitespace, ignoring leading and trailing space', () => {
    assert.deepEqual(splitWords('  Olá,\tmundo\n\nde  novo  '), ['Olá,', 'mundo', 'de', 'novo']);
  });

  it('finds no words in empty or whitespace-only text', () => {
    assert.deepEqual(splitWords(''), []);
    assert.deepEqual(splitWords(' \n\t '), []);
    assert.equal(countWords(''), 0);
  });

  it('counts punctuation-attached tokens as one word each', () => {
    assert.equal(countWords('Passo 1: abra o app.'), 5);
  });

  it('collapses every whitespace run to one space', () => {
    assert.equal(normalizeWhitespace(' a \n b\t\tc '), 'a b c');
  });

  it('normalizes equivalent URLs to the same href', () => {
    assert.equal(normalizeUrl('HTTPS://Example.COM'), 'https://example.com/');
    assert.equal(normalizeUrl('https://example.com:443/docs'), normalizeUrl('https://example.com/docs'));
  });

  it('keeps distinct paths distinct', () => {
    assert.notEqual(normalizeUrl('https://example.com/a'), normalizeUrl('https://example.com/b'));
  });

  it('returns malformed input unchanged', () => {
    assert.equal(normalizeUrl('not a url'), 'not a url');
    assert.equal(normalizeUrl(''), '');
  });
});
