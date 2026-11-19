import { z } from 'zod';

/*
 * The only cell parsers of a metrics import (SPEC 0006 section 5.3). Pure and browser-safe. A cell
 * is text: it is matched by an anchored regex and converted, never evaluated, so a formula such as
 * `=HYPERLINK(...)` is simply `invalid`. A cell that fits no parser is a row issue
 * (`number-invalid`), and the row is skipped.
 */

/** Which parser a canonical column uses; profiles are data and name one of these. */
export const MetricCellParserSchema = z.enum(['integer', 'decimal', 'percent', 'duration', 'hours']);
export type MetricCellParser = z.infer<typeof MetricCellParserSchema>;

export type ParsedCell = { status: 'value'; value: number } | { status: 'empty' } | { status: 'invalid' };

/** Cells that mean "no value" in the three exports; for `views` the row issue is `views-missing`. */
export const emptyCellValues: readonly string[] = Object.freeze(['', '-', '--', 'N/A']);

/** The largest count the snapshot schema accepts (`PlatformMetricsSchema`). */
const MAX_COUNT = 1e12;

const plainInteger = /^[0-9]{1,13}$/;
const groupedInteger = /^[0-9]{1,3}([.,][0-9]{3})+$/;
const decimalPattern = /^[0-9]{1,10}([.,][0-9]{1,4})?$/;
const clockDuration = /^([0-9]{1,3}:)?[0-5]?[0-9]:[0-5][0-9]$/;

const empty: ParsedCell = { status: 'empty' };
const invalid: ParsedCell = { status: 'invalid' };

function valueOf(value: number): ParsedCell {
  return Number.isFinite(value) ? { status: 'value', value } : invalid;
}

/** True for the empty spellings above, after trimming. */
export function isEmptyCell(cell: string): boolean {
  return emptyCellValues.includes(cell.trim());
}

/**
 * Whole counts: `/^[0-9]{1,13}$/`, or groups of three separated by one consistent `,` or `.`
 * (`1.234.567` and `1,234,567`, never `1,234.567`). Values above 10^12 are invalid.
 */
export function parseIntegerCell(cell: string): ParsedCell {
  const text = cell.trim();
  if (isEmptyCell(text)) return empty;
  let digits: string;
  if (plainInteger.test(text)) {
    digits = text;
  } else if (groupedInteger.test(text)) {
    const separators = new Set(text.replace(/[0-9]/g, ''));
    if (separators.size !== 1) return invalid;
    digits = text.replace(/[.,]/g, '');
  } else {
    return invalid;
  }
  const value = Number.parseInt(digits, 10);
  return value <= MAX_COUNT ? valueOf(value) : invalid;
}

/** `/^[0-9]{1,10}([.,][0-9]{1,4})?$/`; a comma is read as the decimal mark. */
export function parseDecimalCell(cell: string): ParsedCell {
  const text = cell.trim();
  if (isEmptyCell(text)) return empty;
  if (!decimalPattern.test(text)) return invalid;
  return valueOf(Number.parseFloat(text.replace(',', '.')));
}

/** A decimal with an optional trailing `%`; the value is in percent (`45%` is 45). */
export function parsePercentCell(cell: string): ParsedCell {
  const text = cell.trim();
  if (!text.endsWith('%')) return parseDecimalCell(text);
  const number = text.slice(0, -1);
  // A bare `%` is not an empty spelling; it is a malformed number.
  return number === '' ? invalid : parseDecimalCell(number);
}

/** `h:mm:ss` or `m:ss` (`/^([0-9]{1,3}:)?[0-5]?[0-9]:[0-5][0-9]$/`) to seconds, or decimal seconds. */
export function parseDurationCell(cell: string): ParsedCell {
  const text = cell.trim();
  if (isEmptyCell(text)) return empty;
  if (!clockDuration.test(text)) return parseDecimalCell(text);
  const parts = text.split(':').map((part) => Number.parseInt(part, 10));
  const [first = 0, second = 0, third] = parts;
  return valueOf(third === undefined ? first * 60 + second : first * 3600 + second * 60 + third);
}

/**
 * Decimal hours (YouTube "Watch time (hours)") to whole seconds. Rounded because the target
 * `watchTimeSeconds` is a whole count.
 */
export function parseHoursCell(cell: string): ParsedCell {
  const hours = parseDecimalCell(cell);
  if (hours.status !== 'value') return hours;
  const seconds = Math.round(hours.value * 3600);
  return seconds <= MAX_COUNT ? valueOf(seconds) : invalid;
}

/** The parser for a column, by its profile name. */
export const metricCellParsers: Readonly<Record<MetricCellParser, (cell: string) => ParsedCell>> = Object.freeze({
  integer: parseIntegerCell,
  decimal: parseDecimalCell,
  percent: parsePercentCell,
  duration: parseDurationCell,
  hours: parseHoursCell,
});
