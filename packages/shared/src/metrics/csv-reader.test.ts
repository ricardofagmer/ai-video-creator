import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { metricsBounds } from './constants';
import { decodeCsvBytes, readCsv, type CsvReadResult } from './csv-reader';

/*
 * SPEC 0006 section 5.3 decode and read stages, R3-AC-09: the 2 MiB, 5,000-row and 64-column
 * bounds, non-UTF-8, zip and empty files. Every fixture is synthetic and built here.
 */

const encoder = new TextEncoder();

function bytesOf(text: string): Uint8Array {
  return encoder.encode(text);
}

function readOrFail(text: string): Extract<CsvReadResult, { status: 'read' }> {
  const result = readCsv(text);
  if (result.status !== 'read') assert.fail(`expected the CSV to be read, got ${result.reason}`);
  return result;
}

function csvWithDataRows(count: number): string {
  return `Content,Views\n${'abcdefghijk,100\n'.repeat(count)}`;
}

function csvWithColumns(count: number): string {
  const header = Array.from({ length: count }, (_, index) => `c${index}`).join(',');
  const row = Array.from({ length: count }, () => '1').join(',');
  return `${header}\n${row}\n`;
}

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 and removes the byte order mark', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf('Views\n1\n')]);
    assert.deepEqual(decodeCsvBytes(withBom), { status: 'decoded', text: 'Views\n1\n' });
  });

  it('keeps multi-byte UTF-8 text intact', () => {
    assert.deepEqual(decodeCsvBytes(bytesOf('Título\nação\n')), { status: 'decoded', text: 'Título\nação\n' });
  });

  it('accepts a file of exactly 2 MiB', () => {
    const atLimit = new Uint8Array(metricsBounds.maxFileBytes).fill(0x61);
    assert.equal(metricsBounds.maxFileBytes, 2 * 1024 * 1024);
    assert.equal(decodeCsvBytes(atLimit).status, 'decoded');
  });

  it('refuses a file over 2 MiB with file-too-large', () => {
    const overLimit = new Uint8Array(metricsBounds.maxFileBytes + 1).fill(0x61);
    assert.deepEqual(decodeCsvBytes(overLimit), { status: 'refused', reason: 'file-too-large' });
  });

  it('refuses an empty file with empty-file', () => {
    assert.deepEqual(decodeCsvBytes(new Uint8Array(0)), { status: 'refused', reason: 'empty-file' });
  });

  it('refuses a zip (and xlsx) by its PK signature with not-csv', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    assert.deepEqual(decodeCsvBytes(zip), { status: 'refused', reason: 'not-csv' });
    const pkText = bytesOf('PK,Views\n1,2\n');
    assert.deepEqual(decodeCsvBytes(pkText), { status: 'refused', reason: 'not-csv' });
  });

  it('refuses a NUL byte, as in a UTF-16 export, with not-csv', () => {
    const utf16le = new Uint8Array([0xff, 0xfe, 0x56, 0x00, 0x69, 0x00, 0x65, 0x00, 0x77, 0x00, 0x73, 0x00]);
    assert.deepEqual(decodeCsvBytes(utf16le), { status: 'refused', reason: 'not-csv' });
  });

  it('refuses malformed UTF-8 (a Latin-1 export) with not-utf8', () => {
    const latin1 = new Uint8Array([...bytesOf('T'), 0xed, ...bytesOf('tulo\n1\n')]);
    assert.deepEqual(decodeCsvBytes(latin1), { status: 'refused', reason: 'not-utf8' });
  });
});

describe('readCsv', () => {
  it('reads a header and data rows with 1-based line numbers', () => {
    const result = readOrFail('Content,Views\nabcdefghijk,100\nbcdefghijkl,200\n');
    assert.deepEqual(result.header, ['Content', 'Views']);
    assert.deepEqual(
      result.rows.map((row) => ({ line: row.line, cells: row.cells })),
      [
        { line: 2, cells: ['abcdefghijk', '100'] },
        { line: 3, cells: ['bcdefghijkl', '200'] },
      ],
    );
  });

  it('reads CRLF line endings, quoted fields and the "" escape', () => {
    const result = readOrFail('Title,Views\r\n"Say ""hi"", world",1\r\n');
    assert.deepEqual(result.rows[0]?.cells, ['Say "hi", world', '1']);
  });

  it('keeps line numbers right after a quoted cell that spans lines', () => {
    const result = readOrFail('Title,Views\n"first\nsecond",1\nplain,2\n');
    assert.deepEqual(
      result.rows.map((row) => row.line),
      [2, 4],
    );
    assert.equal(result.rows[0]?.cells[0], 'first\nsecond');
  });

  it('skips blank lines and fully blank records but counts their lines', () => {
    const result = readOrFail('Content,Views\n\n,\nabcdefghijk,100\n\n');
    assert.deepEqual(
      result.rows.map((row) => row.line),
      [4],
    );
  });

  it('reads a last record without a trailing line feed', () => {
    const result = readOrFail('Content,Views\nabcdefghijk,100');
    assert.equal(result.rows.length, 1);
  });

  it('never evaluates a formula cell: it is returned as text', () => {
    const result = readOrFail('Content,Views\n"=HYPERLINK(""http://x"")",=1+1\n');
    assert.deepEqual(result.rows[0]?.cells, ['=HYPERLINK("http://x")', '=1+1']);
  });

  it('accepts exactly 5,000 data rows', () => {
    assert.equal(metricsBounds.maxRows, 5_000);
    assert.equal(readOrFail(csvWithDataRows(5_000)).rows.length, 5_000);
  });

  it('refuses 5,001 data rows with too-many-rows', () => {
    assert.deepEqual(readCsv(csvWithDataRows(5_001)), { status: 'refused', reason: 'too-many-rows' });
  });

  it('accepts exactly 64 columns', () => {
    assert.equal(metricsBounds.maxColumns, 64);
    assert.equal(readOrFail(csvWithColumns(64)).header.length, 64);
  });

  it('refuses 65 columns with too-many-columns', () => {
    assert.deepEqual(readCsv(csvWithColumns(65)), { status: 'refused', reason: 'too-many-columns' });
  });

  it('refuses 65 columns in a data row too', () => {
    const header = Array.from({ length: 64 }, (_, index) => `c${index}`).join(',');
    const row = Array.from({ length: 65 }, () => '1').join(',');
    assert.deepEqual(readCsv(`${header}\n${row}\n`), { status: 'refused', reason: 'too-many-columns' });
  });

  it('refuses an empty text, a header with no data row and only blank lines with empty-file', () => {
    assert.deepEqual(readCsv(''), { status: 'refused', reason: 'empty-file' });
    assert.deepEqual(readCsv('Content,Views\n'), { status: 'refused', reason: 'empty-file' });
    assert.deepEqual(readCsv('\n\n'), { status: 'refused', reason: 'empty-file' });
  });

  it('refuses a first record with no named column with header-missing', () => {
    assert.deepEqual(readCsv(',,\nabcdefghijk,100,1\n'), { status: 'refused', reason: 'header-missing' });
  });

  it('refuses malformed quoting and a lone carriage return with not-csv', () => {
    assert.deepEqual(readCsv('Content,Views\n"open,1\n'), { status: 'refused', reason: 'not-csv' });
    assert.deepEqual(readCsv('Content,Views\n"a"b,1\n'), { status: 'refused', reason: 'not-csv' });
    assert.deepEqual(readCsv('Content,Views\nab"c,1\n'), { status: 'refused', reason: 'not-csv' });
    assert.deepEqual(readCsv('Content,Views\rabcdefghijk,1\n'), { status: 'refused', reason: 'not-csv' });
  });

  it('truncates a data cell over the cell bound and flags its row', () => {
    const longCell = 'x'.repeat(metricsBounds.maxCellChars + 10);
    const result = readOrFail(`Content,Views\n${longCell},1\nabcdefghijk,2\n`);
    assert.equal(result.rows[0]?.cellTooLong, true);
    assert.equal(result.rows[0]?.cells[0]?.length, metricsBounds.maxCellChars);
    assert.equal(result.rows[1]?.cellTooLong, false);
  });

  it('refuses a header cell over the cell bound with not-csv', () => {
    const longHeader = 'h'.repeat(metricsBounds.maxCellChars + 1);
    assert.deepEqual(readCsv(`${longHeader},Views\nabcdefghijk,1\n`), { status: 'refused', reason: 'not-csv' });
  });
});
