import { type ActionReport, type InvokerStatus } from '../actions/studio-invoker';
import { type ReviewSummary } from '../state/review-summary';
import { type ScheduleSummary } from '../state/schedule-summary';
import { type ServiceStatus, type ShellState, type WatcherStatus } from '../state/state-model';
import { formatSlot } from './format-slot';
import { labels } from './labels';

export type MenuActionId = 'start' | 'stop' | 'open-studio' | 'quit';

/**
 * A renderer-independent menu. `info` lines are always disabled. The watcher has only an info line:
 * no item starts, stops or restarts it (ADR 0005 decision 3).
 */
export type MenuItemModel =
  | { kind: 'info'; label: string }
  | { kind: 'action'; id: MenuActionId; label: string; enabled: boolean }
  | { kind: 'checkbox'; id: 'open-at-login'; label: string; checked: boolean }
  | { kind: 'separator' };

export interface MenuView {
  readonly state: ShellState;
  readonly action: InvokerStatus;
  readonly openAtLogin: boolean;
  /** Tests fix it; production leaves it undefined for the local zone. */
  readonly timeZone?: string;
}

function watcherLine(status: WatcherStatus): string {
  switch (status) {
    case 'alive':
      return labels.watcherAlive;
    case 'dead':
      return labels.watcherDead;
    case 'absent':
      return labels.watcherAbsent;
  }
}

function serviceLine(status: ServiceStatus, texts: { running: string; stopped: string; unknown: string }): string {
  return texts[status];
}

function scheduleLines(summary: ScheduleSummary, timeZone: string | undefined): string[] {
  if (summary.status === 'unavailable') return [labels.schedulesUnavailable];
  const lines = [summary.nextSlotAtMs === null ? labels.noActiveSchedule : `${labels.nextSlotPrefix}${formatSlot(summary.nextSlotAtMs, timeZone)}`];
  if (summary.skipped > 0) lines.push(`${labels.unreadableSchedulesPrefix}${summary.skipped}`);
  return lines;
}

function reviewLines(summary: ReviewSummary): string[] {
  if (summary.status === 'unavailable') return [labels.reviewUnavailable];
  const lines = [`${labels.reviewPrefix}${summary.count}`];
  if (summary.skipped > 0) lines.push(`${labels.unreadableRunsPrefix}${summary.skipped}`);
  return lines;
}

function reportLine(report: ActionReport): string {
  const starting = report.action === 'start';
  switch (report.outcome.kind) {
    case 'succeeded':
      return starting ? labels.startSucceeded : labels.stopSucceeded;
    case 'dependency-unavailable':
      return starting ? labels.startDependency : labels.stopDependency;
    case 'failed': {
      const prefix = starting ? labels.startFailedPrefix : labels.stopFailedPrefix;
      return report.outcome.exitCode === null ? prefix : `${prefix} (código ${report.outcome.exitCode})`;
    }
  }
}

/** The line under the actions: progress while one runs, the last result after it ends. */
function actionLine(action: InvokerStatus): string | null {
  switch (action.phase) {
    case 'running':
      return action.action === 'start' ? labels.starting : labels.stopping;
    case 'unresponsive':
      return action.action === 'start' ? labels.startNoResponse : labels.stopNoResponse;
    case 'idle':
      return action.last === null ? null : reportLine(action.last);
  }
}

/** "Iniciar": api or web is not running, and no action is in flight. */
export function isStartEnabled(state: Pick<ShellState, 'api' | 'web'>, action: InvokerStatus): boolean {
  return action.phase === 'idle' && (state.api !== 'running' || state.web !== 'running');
}

/** "Parar": api or web is running or unknown, and no action is in flight. */
export function isStopEnabled(state: Pick<ShellState, 'api' | 'web'>, action: InvokerStatus): boolean {
  const stoppable = (status: ServiceStatus): boolean => status === 'running' || status === 'unknown';
  return action.phase === 'idle' && (stoppable(state.api) || stoppable(state.web));
}

/** "Abrir estúdio": only while the web is running. */
export function isOpenStudioEnabled(state: Pick<ShellState, 'web'>): boolean {
  return state.web === 'running';
}

export function buildMenuModel(view: MenuView): MenuItemModel[] {
  const { state, action } = view;
  const info = (label: string): MenuItemModel => ({ kind: 'info', label });
  const items: MenuItemModel[] = [
    info(watcherLine(state.watcher)),
    info(serviceLine(state.api, { running: labels.apiRunning, stopped: labels.apiStopped, unknown: labels.apiUnknown })),
    info(serviceLine(state.web, { running: labels.webRunning, stopped: labels.webStopped, unknown: labels.webUnknown })),
    { kind: 'separator' },
    ...scheduleLines(state.schedules, view.timeZone).map(info),
    ...reviewLines(state.reviews).map(info),
    { kind: 'separator' },
    { kind: 'action', id: 'start', label: labels.start, enabled: isStartEnabled(state, action) },
    { kind: 'action', id: 'stop', label: labels.stop, enabled: isStopEnabled(state, action) },
  ];
  const line = actionLine(action);
  if (line !== null) items.push(info(line));
  items.push(
    { kind: 'action', id: 'open-studio', label: labels.openStudio, enabled: isOpenStudioEnabled(state) },
    { kind: 'separator' },
    { kind: 'checkbox', id: 'open-at-login', label: labels.openAtLogin, checked: view.openAtLogin },
    { kind: 'action', id: 'quit', label: labels.quit, enabled: true },
  );
  return items;
}

/** Shown when `shell-config.json` is missing or invalid: one disabled line and "Sair", no action. */
export function buildIncompleteInstallationMenu(): MenuItemModel[] {
  return [
    { kind: 'info', label: labels.incompleteInstallation },
    { kind: 'separator' },
    { kind: 'action', id: 'quit', label: labels.quit, enabled: true },
  ];
}
