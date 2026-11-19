import { type RunAction, type WatcherState } from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import { type RunState, type RunStatus, type StepName } from '@studio/shared/run-format';

/** design/componentes-estudio.md section 7: `StepName` in pt-BR. */
export const stepLabels: Readonly<Record<StepName, string>> = {
  brief: 'Briefing',
  preflight: 'Pré-checagem',
  snapshot: 'Registro de entradas',
  execute: 'Execução',
  verify: 'Verificação',
  archive: 'Arquivamento',
  record: 'Registro',
};

/**
 * Statuses at which the run page stops polling (design/telas/08 "Terminal"). `draft` is added:
 * nothing changes a draft until the owner starts it, and starting it wakes the poll.
 */
const pollingStopStatuses: readonly RunStatus[] = ['draft', 'review', 'approved', 'rejected', 'failed'];

export function stopsPolling(status: RunStatus): boolean {
  return pollingStopStatuses.includes(status);
}

/** Statuses the run list keeps refreshing for (design/telas/07: "enquanto houver execução não terminal"). */
export function isLiveStatus(status: RunStatus): boolean {
  return !pollingStopStatuses.includes(status);
}

/**
 * Which RunControls the api accepts for a displayed status (`RequestRunControlHandler`, R1-17):
 * `pause` and `stop` only for `pending` and `running`; `resume` only with no live watcher for
 * `paused` and `interrupted` here (a `waiting` run resumes from its WaitingNotice instead, and a
 * `failed` run shows no controls, design/componentes-estudio.md section 6).
 */
export function availableRunActions(status: RunStatus): Readonly<Record<RunAction, boolean>> {
  const interruptible = status === 'pending' || status === 'running';
  const resumable = status === 'paused' || status === 'interrupted';
  return { pause: interruptible, stop: interruptible, resume: resumable };
}

/**
 * WatcherIndicator state for one run (design/telas/08): the pid in `watcher.pid` alive or dead,
 * "sem resposta" when the api did not answer. An absent pid is normal for a held or finished run,
 * so it shows nothing rather than a false alarm.
 */
export function runWatcherState(watcher: RunStateResponse['watcher'], apiReachable: boolean): WatcherState | null {
  if (!apiReachable) return 'unknown';
  if (watcher === 'alive') return 'running';
  if (watcher === 'dead') return 'stopped';
  return null;
}

/** The review page exists for these runs; a run rejected at the plan or a recipe gate never reached it. */
export function hasReview(state: RunState): boolean {
  if (state.status === 'review' || state.status === 'approved') return true;
  return state.status === 'rejected' && state.gate === 'final';
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** `18/11/2026 14:02` (design/telas/08, 09). */
export function formatDateTime(isoOrMs: string | number): string {
  return dateTimeFormatter.format(new Date(isoOrMs)).replace(',', '');
}

/** `14:05:12` (EventLog time column). */
export function formatTime(epochMs: number): string {
  return timeFormatter.format(new Date(epochMs));
}

/** `2 s`, `1 min 12 s`, `1 h 3 min`. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

/** `1:34` for the video caption (design/telas/09). */
export function formatClock(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
