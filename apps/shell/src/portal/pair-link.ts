/*
 * The pair code handed from `studio portal pair` to the system browser. The code lives only in
 * memory and in the URL fragment, which the browser never sends to a server; it is never logged,
 * written to a file, shown in the menu or put in a query string.
 */

import { isLocalPortalUrl } from './portal-settings';

/**
 * `PAIR_CODE_ALPHABET` and `PAIR_CODE_LENGTH` of `@studio/shared/api`, rebuilt here because that
 * subpath evaluates every api schema (and zod) at load, which the Electron bundle does not need.
 * Drift is a review item for the final gate.
 */
const PAIR_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
/** One JSON line of two short fields; anything far larger is not the CLI's answer. */
const MAX_PAIR_OUTPUT_CHARS = 256;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface IssuedPairCode {
  readonly code: string;
  readonly expiresAtMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The single JSON line the CLI printed, or null when stdout is anything else. */
function singleJsonLine(stdout: string, maxChars: number): unknown {
  const text = stdout.trim();
  if (text === '' || text.length > maxChars || text.includes('\n')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(record);
  return present.length === keys.length && keys.every((key) => present.includes(key));
}

/**
 * Parses `{"code":"<8 chars>","expiresAt":"<ISO instant>"}`. A code that has already expired by the
 * shell's clock is refused, so the browser never opens with a code the api will reject.
 */
export function parsePairOutput(stdout: string, nowMs: number): IssuedPairCode | null {
  const parsed = singleJsonLine(stdout, MAX_PAIR_OUTPUT_CHARS);
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['code', 'expiresAt'])) return null;
  const { code, expiresAt } = parsed;
  if (typeof code !== 'string' || !PAIR_CODE_PATTERN.test(code)) return null;
  if (typeof expiresAt !== 'string' || !ISO_INSTANT_PATTERN.test(expiresAt)) return null;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  return { code, expiresAtMs };
}

/** Parses `{"revoked":<non-negative integer>}`. */
export function parseDisconnectOutput(stdout: string): number | null {
  const parsed = singleJsonLine(stdout, MAX_PAIR_OUTPUT_CHARS);
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['revoked'])) return null;
  const { revoked } = parsed;
  return typeof revoked === 'number' && Number.isSafeInteger(revoked) && revoked >= 0 ? revoked : null;
}

/**
 * `<portal origin>/#pair=<CODE>` (frozen by plan section 9.1). Built with `URL` from a validated
 * https (or local portal) origin and a validated code, so neither can add a path, a query or another scheme.
 */
export function pairLink(portalOrigin: string, code: string): string {
  if (!PAIR_CODE_PATTERN.test(code)) throw new RangeError('pair code has an unexpected shape');
  const url = new URL(portalOrigin);
  const schemeAllowed = url.protocol === 'https:' || isLocalPortalUrl(url);
  if (!schemeAllowed || url.pathname !== '/' || url.search !== '') throw new RangeError('portal origin is not an https origin');
  url.hash = `pair=${code}`;
  return url.toString();
}
