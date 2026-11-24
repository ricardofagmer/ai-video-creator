import type { RunId } from '@studio/shared/run-format';
import type { ScheduleId, ScheduleStatus } from '@studio/shared/schedules';
import { cliText } from '../i18n/messages.js';
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

function unreadableLabel(file: UnreadableScheduleFile): string {
  const text = cliText().doctor.schedules;
  return file === 'schedule' ? text.scheduleUnreadable : text.slotsUnreadable;
}

function detailLines(scan: ScheduleScan): string[] {
  const text = cliText().doctor;
  const entries = [
    ...scan.unreadable.map((entry) => `        ${entry.scheduleId}: ${unreadableLabel(entry.file)}`),
    ...scan.missingFiredRuns.map((entry) => `        ${entry.scheduleId}: ${text.schedules.firedWithoutFolder(entry.runId)}`),
  ];
  const lines = entries.slice(0, MAX_LISTED);
  if (entries.length > MAX_LISTED) lines.push(text.data.andMore(entries.length - MAX_LISTED));
  return lines;
}

/**
 * The schedule checks of SPEC 0006 section 5.7: every `schedule.json` parses (and its slot log),
 * each `fired` run folder exists, and a warning when schedules are active while the watcher is not
 * running (their slots would be missed). An unreadable file fails `doctor`, since the watcher skips
 * that schedule; a missing run folder and a stopped watcher are warnings. Ids and counts only.
 */
export function scheduleChecks(scan: ScheduleScan, watcherRunning: boolean): { check: DoctorCheck; lines: string[] } {
  const text = cliText().doctor;
  const label = text.labels.schedules;
  const active = scan.schedules.filter((schedule) => schedule.status === 'active').length;
  const paused = scan.schedules.filter((schedule) => schedule.status === 'paused').length;
  const problems: string[] = [];
  if (scan.unreadable.length > 0) problems.push(text.schedules.unreadableFiles(scan.unreadable.length));
  if (scan.missingFiredRuns.length > 0) problems.push(text.schedules.missingRuns(scan.missingFiredRuns.length));
  if (active > 0 && !watcherRunning) problems.push(text.schedules.watcherStopped(active));
  const lines = detailLines(scan);
  if (problems.length === 0) return { check: { label, status: 'ok', detail: text.schedules.ok(active, paused) }, lines };
  return { check: { label, status: scan.unreadable.length > 0 ? 'failed' : 'warning', detail: `${problems.join('; ')}.` }, lines };
}
