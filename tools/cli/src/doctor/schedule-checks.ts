import type { RunId } from '@studio/shared/run-format';
import type { ScheduleId, ScheduleStatus } from '@studio/shared/schedules';
import { type DoctorCheck } from './doctor-check.js';

/** Which file of a schedule folder could not be read against its contract. */
export type UnreadableScheduleFile = 'schedule' | 'slots';

/** What `scanSchedules` found in `<data home>/schedules/`, read only. */
export interface ScheduleScan {
  schedules: { scheduleId: ScheduleId; status: ScheduleStatus }[];
  unreadable: { scheduleId: ScheduleId; file: UnreadableScheduleFile }[];
  /** `fired` slot lines whose run folder is not in `runs/`. */
  missingFiredRuns: { scheduleId: ScheduleId; runId: RunId }[];
}

/** Ids listed one per line before the rest is summarised. */
const MAX_LISTED = 20;

const unreadableLabels: Readonly<Record<UnreadableScheduleFile, string>> = {
  schedule: 'agendamento ilegível',
  slots: 'registro de horários ilegível',
};

function detailLines(scan: ScheduleScan): string[] {
  const entries = [
    ...scan.unreadable.map((entry) => `        ${entry.scheduleId}: ${unreadableLabels[entry.file]}`),
    ...scan.missingFiredRuns.map((entry) => `        ${entry.scheduleId}: execução disparada ${entry.runId} sem pasta`),
  ];
  const lines = entries.slice(0, MAX_LISTED);
  if (entries.length > MAX_LISTED) lines.push(`        ... e mais ${entries.length - MAX_LISTED}.`);
  return lines;
}

/**
 * The schedule checks of SPEC 0006 section 5.7: every `schedule.json` parses (and its slot log),
 * each `fired` run folder exists, and a warning when schedules are active while the watcher is not
 * running (their slots would be missed). An unreadable file fails `doctor`, since the watcher skips
 * that schedule; a missing run folder and a stopped watcher are warnings. Ids and counts only.
 */
export function scheduleChecks(scan: ScheduleScan, watcherRunning: boolean): { check: DoctorCheck; lines: string[] } {
  const label = 'agendamentos';
  const active = scan.schedules.filter((schedule) => schedule.status === 'active').length;
  const paused = scan.schedules.filter((schedule) => schedule.status === 'paused').length;
  const problems: string[] = [];
  if (scan.unreadable.length > 0) problems.push(`${scan.unreadable.length} arquivo(s) ilegível(is); o watcher pula esse(s) agendamento(s)`);
  if (scan.missingFiredRuns.length > 0) problems.push(`${scan.missingFiredRuns.length} execução(ões) disparada(s) sem pasta em runs/`);
  if (active > 0 && !watcherRunning) problems.push(`${active} ativo(s), mas o watcher não está rodando: os horários serão perdidos`);
  const lines = detailLines(scan);
  if (problems.length === 0) {
    return { check: { label, status: 'ok', detail: `${active} ativo(s), ${paused} pausado(s); arquivos legíveis e execuções disparadas presentes.` }, lines };
  }
  return { check: { label, status: scan.unreadable.length > 0 ? 'failed' : 'warning', detail: `${problems.join('; ')}.` }, lines };
}
