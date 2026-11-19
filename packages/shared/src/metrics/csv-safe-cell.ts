/*
 * CSV injection guard (SPEC 0006 section 6). R3 writes no CSV; any later export passes every cell
 * through `csvSafeCell`, so the rule has one home. A spreadsheet treats a cell starting with one of
 * the six characters below as a formula; prefixing `'` makes it text.
 */

/** `=`, `+`, `-`, `@`, tab and carriage return (R3-AC-10). */
export const csvFormulaLeadCharacters: readonly string[] = Object.freeze(['=', '+', '-', '@', '\t', '\r']);

const needsQuoting = /[",\r\n]/;

/**
 * One CSV cell, safe to open in a spreadsheet: a leading formula character gets a `'` prefix, then
 * the cell is quoted per RFC 4180 (wrapped in `"` with inner `"` doubled) when it holds a quote, a
 * comma, a carriage return or a line feed.
 */
export function csvSafeCell(value: string): string {
  const first = value.charAt(0);
  const text = csvFormulaLeadCharacters.includes(first) ? `'${value}` : value;
  return needsQuoting.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
