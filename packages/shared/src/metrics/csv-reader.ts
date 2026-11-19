import { metricsBounds } from './constants';
import { type MetricImportRefusedReason } from './enums';

/*
 * The decode and read stages of a metrics import (SPEC 0006 section 5.3). Pure, browser-safe, no
 * dependency (K9). The upload is untrusted: every bound is enforced while reading, so a hostile
 * file stops early instead of being held whole as parsed rows. Cells come back as text; nothing
 * here interprets or evaluates them.
 */

export type CsvDecodeRefusal = Extract<MetricImportRefusedReason, 'file-too-large' | 'not-utf8' | 'not-csv' | 'empty-file'>;
export type CsvDecodeResult = { status: 'decoded'; text: string } | { status: 'refused'; reason: CsvDecodeRefusal };

export type CsvReadRefusal = Extract<
  MetricImportRefusedReason,
  'not-csv' | 'too-many-rows' | 'too-many-columns' | 'header-missing' | 'empty-file'
>;

/** One data record; `line` is the 1-based physical line it starts on, as reported to the owner. */
export interface CsvRow {
  line: number;
  cells: string[];
  /** A cell passed `maxCellChars`; it was truncated while reading and the row is an issue. */
  cellTooLong: boolean;
}

export type CsvReadResult = { status: 'read'; header: string[]; rows: CsvRow[] } | { status: 'refused'; reason: CsvReadRefusal };

/**
 * Strict UTF-8 decode (`fatal: true`), BOM removed. Refuses an oversized or empty file, a NUL
 * byte, and the `PK` zip signature (zip and xlsx), whatever the declared name or content type.
 */
export function decodeCsvBytes(bytes: Uint8Array): CsvDecodeResult {
  if (bytes.length > metricsBounds.maxFileBytes) return { status: 'refused', reason: 'file-too-large' };
  if (bytes.length === 0) return { status: 'refused', reason: 'empty-file' };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { status: 'refused', reason: 'not-csv' };
  if (bytes.includes(0x00)) return { status: 'refused', reason: 'not-csv' };
  try {
    return { status: 'decoded', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    // The fatal decoder throws exactly on malformed UTF-8 (a UTF-16 export included).
    return { status: 'refused', reason: 'not-utf8' };
  }
}

type ReaderState = 'field-start' | 'unquoted' | 'quoted' | 'quote-in-quoted';

class CsvRefused extends Error {
  constructor(readonly reason: CsvReadRefusal) {
    super(`CSV refused: ${reason}`);
    this.name = 'CsvRefused';
  }
}

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

/** Collects records into a header and bounded data rows. */
class RecordSink {
  header: string[] | null = null;
  readonly rows: CsvRow[] = [];

  accept(record: CsvRow): void {
    // A truly empty line (one empty cell) is skipped anywhere, as exports often end with one.
    if (record.cells.length === 1 && record.cells[0] === '') return;
    if (this.header === null) {
      if (isBlank(record.cells)) throw new CsvRefused('header-missing');
      if (record.cellTooLong) throw new CsvRefused('not-csv');
      this.header = record.cells;
      return;
    }
    if (isBlank(record.cells)) return;
    this.rows.push(record);
    if (this.rows.length > metricsBounds.maxRows) throw new CsvRefused('too-many-rows');
  }
}

/** Builds one record, bounding columns and cell length as characters arrive. */
class RecordBuilder {
  private cells: string[] = [];
  private cell = '';
  private cellTooLong = false;
  started = false;

  append(character: string): void {
    this.started = true;
    if (this.cell.length >= metricsBounds.maxCellChars) {
      this.cellTooLong = true;
      return;
    }
    this.cell += character;
  }

  endCell(): void {
    this.started = true;
    this.cells.push(this.cell);
    this.cell = '';
    if (this.cells.length > metricsBounds.maxColumns) throw new CsvRefused('too-many-columns');
  }

  take(line: number): CsvRow {
    this.endCell();
    const record: CsvRow = { line, cells: this.cells, cellTooLong: this.cellTooLong };
    this.cells = [];
    this.cellTooLong = false;
    this.started = false;
    return record;
  }
}

function readRecords(text: string, sink: RecordSink): void {
  const builder = new RecordBuilder();
  let state: ReaderState = 'field-start';
  let line = 1;
  let recordLine = 1;
  const endRecord = (): void => {
    sink.accept(builder.take(recordLine));
    line += 1;
    recordLine = line;
    state = 'field-start';
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const lineEnd = character === '\n' || (character === '\r' && text.charAt(index + 1) === '\n');
    if (state === 'quoted') {
      if (character === '"') {
        state = 'quote-in-quoted';
      } else {
        if (character === '\n') line += 1;
        builder.append(character);
      }
      continue;
    }
    if (state === 'quote-in-quoted' && character === '"') {
      builder.append('"');
      state = 'quoted';
      continue;
    }
    if (character === ',') {
      builder.endCell();
      state = 'field-start';
    } else if (lineEnd) {
      if (character === '\r') index += 1;
      endRecord();
    } else if (state === 'quote-in-quoted' || character === '\r') {
      // Text after a closing quote, or a carriage return without its line feed: not RFC 4180.
      throw new CsvRefused('not-csv');
    } else if (character === '"') {
      if (state !== 'field-start') throw new CsvRefused('not-csv');
      builder.started = true;
      state = 'quoted';
    } else {
      builder.append(character);
      state = 'unquoted';
    }
  }
  if (state === 'quoted') throw new CsvRefused('not-csv');
  if (builder.started) endRecord();
}

/**
 * `readCsv` (section 5.3): RFC 4180, comma only, quoted fields, `""` escape, CRLF or LF. The first
 * non-empty record is the header; fully blank data records are skipped. Refuses with
 * `too-many-rows` (over `maxRows` data rows), `too-many-columns` (over `maxColumns` in any record),
 * `not-csv` (a malformed quote, a lone carriage return, a header cell over `maxCellChars`),
 * `header-missing` (the first record has no named column) or `empty-file` (no header or no data
 * row). A data cell over `maxCellChars` is truncated and flags its row (`cell-too-long`).
 */
export function readCsv(text: string): CsvReadResult {
  const sink = new RecordSink();
  try {
    readRecords(text, sink);
  } catch (error) {
    if (error instanceof CsvRefused) return { status: 'refused', reason: error.reason };
    throw error;
  }
  if (sink.header === null || sink.rows.length === 0) return { status: 'refused', reason: 'empty-file' };
  return { status: 'read', header: sink.header, rows: sink.rows };
}
