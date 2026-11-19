import { failedBeforeAnyCall, scanCurations } from '../curations/curation-reader.js';
import { type DoctorCheck } from './doctor-check.js';

/** How far back a curation that failed before any model call is still worth a warning. */
export const CURATION_FAILURE_WINDOW_DAYS = 7;

/** Curation ids listed one per line before the rest is summarised. */
const MAX_LISTED_CURATIONS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the window in which a curation that failed before any model call is reported. */
export function curationFailureWindowStart(now: Date): Date {
  return new Date(now.getTime() - CURATION_FAILURE_WINDOW_DAYS * DAY_MS);
}

/**
 * File-only check, so it still reports when the database cannot boot. Warns for curations that
 * ended `failed` before any model call in the last `CURATION_FAILURE_WINDOW_DAYS` days (a parked
 * request lands there) and for folders that cannot be read. Ids and counts only, never curation
 * text; nothing is written.
 */
export async function checkCurations(
  curationsRoot: string,
  options: { now: Date; signal: AbortSignal },
): Promise<{ check: DoctorCheck; lines: string[] }> {
  const scan = await scanCurations(curationsRoot, options.signal);
  const failed = failedBeforeAnyCall(scan, curationFailureWindowStart(options.now));
  const label = 'curadorias';
  if (failed.length === 0 && scan.unreadable.length === 0) {
    return {
      check: { label, status: 'ok', detail: `nenhuma falhou antes de chamar o modelo nos últimos ${CURATION_FAILURE_WINDOW_DAYS} dias.` },
      lines: [],
    };
  }
  const parts: string[] = [];
  if (failed.length > 0) {
    parts.push(`${failed.length} terminou(aram) com falha antes de chamar o modelo nos últimos ${CURATION_FAILURE_WINDOW_DAYS} dias; peça de novo se ainda quiser a proposta`);
  }
  if (scan.unreadable.length > 0) parts.push(`${scan.unreadable.length} pasta(s) ilegível(is)`);
  const ids = [...failed.map((entry) => entry.curationId), ...scan.unreadable];
  const lines = ids.slice(0, MAX_LISTED_CURATIONS).map((curationId) => `        ${curationId}`);
  if (ids.length > MAX_LISTED_CURATIONS) lines.push(`        ... e mais ${ids.length - MAX_LISTED_CURATIONS}.`);
  return { check: { label, status: 'warning', detail: `${parts.join('; ')}.` }, lines };
}
