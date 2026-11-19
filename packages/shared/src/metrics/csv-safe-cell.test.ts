import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { csvFormulaLeadCharacters, csvSafeCell } from './csv-safe-cell';

/* SPEC 0006 section 6, R3-AC-10: every one of the six leading characters gets a `'` prefix. */

describe('csvSafeCell', () => {
  it('lists exactly the six formula lead characters', () => {
    assert.deepEqual([...csvFormulaLeadCharacters], ['=', '+', '-', '@', '\t', '\r']);
  });

  it('prefixes = with a quote', () => {
    assert.equal(csvSafeCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  });

  it('prefixes + with a quote', () => {
    assert.equal(csvSafeCell('+1'), "'+1");
  });

  it('prefixes - with a quote', () => {
    assert.equal(csvSafeCell('-2+3'), "'-2+3");
  });

  it('prefixes @ with a quote', () => {
    assert.equal(csvSafeCell('@SUM(1)'), "'@SUM(1)");
  });

  it('prefixes a tab with a quote', () => {
    assert.equal(csvSafeCell('\t=1'), "'\t=1");
  });

  it('prefixes a carriage return with a quote, then quotes the cell because it holds a CR', () => {
    assert.equal(csvSafeCell('\r=1'), `"'\r=1"`);
  });

  it('prefixes, then quotes a formula cell that also holds a comma or a quote', () => {
    assert.equal(csvSafeCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it('leaves a plain cell unchanged and does not prefix a formula character that is not first', () => {
    assert.equal(csvSafeCell('hello'), 'hello');
    assert.equal(csvSafeCell('1+1'), '1+1');
    assert.equal(csvSafeCell('a@b'), 'a@b');
    assert.equal(csvSafeCell(''), '');
  });

  it('quotes a plain cell holding a comma, a quote or a line feed per RFC 4180', () => {
    assert.equal(csvSafeCell('a,b'), '"a,b"');
    assert.equal(csvSafeCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvSafeCell('line\nnext'), '"line\nnext"');
  });
});
