import { RangeNotSatisfiableError } from '../platform/api.errors';

export type ByteRange = { kind: 'full' } | { kind: 'partial'; start: number; end: number };

/** Fifteen digits stay below Number.MAX_SAFE_INTEGER, so parsed offsets are exact. */
const SINGLE_RANGE = /^bytes=(\d{0,15})-(\d{0,15})$/;

/**
 * One `Range: bytes=` range (RFC 9110 14.1.2), enough for the web to seek `final.mp4`. A header
 * that is absent, malformed or asks for several ranges is ignored and the whole file is served,
 * which the RFC allows; a well-formed range outside the file is refused with 416.
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange {
  if (header === undefined) return { kind: 'full' };
  const match = SINGLE_RANGE.exec(header.trim());
  if (match === null) return { kind: 'full' };
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return { kind: 'full' };
  if (startText === '') {
    const suffixLength = Number.parseInt(endText, 10);
    if (suffixLength === 0 || size === 0) throw new RangeNotSatisfiableError();
    return { kind: 'partial', start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number.parseInt(startText, 10);
  if (start >= size) throw new RangeNotSatisfiableError();
  const requestedEnd = endText === '' ? size - 1 : Number.parseInt(endText, 10);
  if (requestedEnd < start) return { kind: 'full' };
  return { kind: 'partial', start, end: Math.min(requestedEnd, size - 1) };
}
