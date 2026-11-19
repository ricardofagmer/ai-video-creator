import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isEmptyCell,
  metricCellParsers,
  parseDecimalCell,
  parseDurationCell,
  parseHoursCell,
  parseIntegerCell,
  parsePercentCell,
  type ParsedCell,
} from './cell-parsers';

/*
 * SPEC 0006 section 5.3 cell parsers: the only ones; a cell that fits none is invalid, which the
 * parse stage reports as a row issue. No cell is evaluated.
 */

function value(number: number): ParsedCell {
  return { status: 'value', value: number };
}

const empty: ParsedCell = { status: 'empty' };
const invalid: ParsedCell = { status: 'invalid' };

type Parser = (cell: string) => ParsedCell;

function expectAll(parser: Parser, cases: readonly (readonly [string, ParsedCell])[]): void {
  for (const [cell, expected] of cases) {
    assert.deepEqual(parser(cell), expected, `cell ${JSON.stringify(cell)}`);
  }
}

describe('empty cells', () => {
  it('reads "", "-", "--" and "N/A" (trimmed) as empty in every parser', () => {
    for (const cell of ['', '-', '--', 'N/A', '  ', ' -- ']) {
      assert.equal(isEmptyCell(cell), true, `cell ${JSON.stringify(cell)}`);
      for (const parser of Object.values(metricCellParsers)) {
        assert.deepEqual(parser(cell), empty, `cell ${JSON.stringify(cell)}`);
      }
    }
  });

  it('does not read other placeholders as empty', () => {
    for (const cell of ['n/a', 'null', '0', '—']) assert.equal(isEmptyCell(cell), false, `cell ${JSON.stringify(cell)}`);
  });
});

describe('parseIntegerCell', () => {
  it('accepts plain digits up to 13 and consistent groups of three', () => {
    expectAll(parseIntegerCell, [
      ['0', value(0)],
      ['1234', value(1234)],
      [' 42 ', value(42)],
      ['1,234', value(1234)],
      ['1.234', value(1234)],
      ['1,234,567', value(1_234_567)],
      ['1.234.567', value(1_234_567)],
      ['1000000000000', value(1e12)],
    ]);
  });

  it('refuses mixed separators, bad groups, signs, exponents, formulas and values over 10^12', () => {
    expectAll(parseIntegerCell, [
      ['1,234.567', invalid],
      ['1.234,567', invalid],
      ['1234,567', invalid],
      ['1,23', invalid],
      ['12.5', invalid],
      ['-5', invalid],
      ['+5', invalid],
      ['1e3', invalid],
      ['=1+1', invalid],
      ['@SUM(A1)', invalid],
      ['12345678901234', invalid],
      ['1000000000001', invalid],
      ['abc', invalid],
    ]);
  });
});

describe('parseDecimalCell', () => {
  it('accepts up to 10 integer digits and 4 decimals, with a dot or a comma', () => {
    expectAll(parseDecimalCell, [
      ['12', value(12)],
      ['12.5', value(12.5)],
      ['12,5', value(12.5)],
      ['0.0001', value(0.0001)],
    ]);
  });

  it('refuses 5 decimals, grouping, signs and text', () => {
    expectAll(parseDecimalCell, [
      ['1.23456', invalid],
      ['1,234.5', invalid],
      ['-1.5', invalid],
      ['12345678901', invalid],
      ['1.', invalid],
      ['.5', invalid],
      ['x', invalid],
    ]);
  });
});

describe('parsePercentCell', () => {
  it('accepts a decimal with an optional trailing %', () => {
    expectAll(parsePercentCell, [
      ['45', value(45)],
      ['45%', value(45)],
      ['45,5%', value(45.5)],
      ['45.25%', value(45.25)],
    ]);
  });

  it('refuses a bare %, a leading % and a negative value', () => {
    expectAll(parsePercentCell, [
      ['%', invalid],
      ['%45', invalid],
      ['-4%', invalid],
      ['45%%', invalid],
    ]);
  });
});

describe('parseDurationCell', () => {
  it('reads m:ss and h:mm:ss to seconds, or decimal seconds', () => {
    expectAll(parseDurationCell, [
      ['0:45', value(45)],
      ['1:05', value(65)],
      ['12:30', value(750)],
      ['1:02:03', value(3723)],
      ['12.5', value(12.5)],
      ['30', value(30)],
    ]);
  });

  it('refuses out-of-range minutes or seconds and other shapes', () => {
    expectAll(parseDurationCell, [
      ['1:60', invalid],
      ['1:60:00', invalid],
      ['1:2', invalid],
      ['1:02:03:04', invalid],
      ['1h', invalid],
    ]);
  });
});

describe('parseHoursCell', () => {
  it('multiplies decimal hours by 3600 into whole seconds', () => {
    expectAll(parseHoursCell, [
      ['1', value(3600)],
      ['1.5', value(5400)],
      ['0,25', value(900)],
      ['0.0001', value(0)],
    ]);
  });

  it('refuses what the decimal parser refuses', () => {
    expectAll(parseHoursCell, [
      ['1:00', invalid],
      ['=1', invalid],
    ]);
  });
});
