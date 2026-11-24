import { type ActionReport, type InvokerStatus } from '../actions/studio-invoker';
import { type PortalMenuState } from '../portal/portal-state';
import { type ReviewSummary } from '../state/review-summary';
import { type ScheduleSummary } from '../state/schedule-summary';
import { type ServiceStatus, type ShellState, type WatcherStatus } from '../state/state-model';
import { type ShellLocale } from '../i18n/locale';
import { formatSlot } from './format-slot';
import { shellLabels, type ShellLabels } from './labels';
import { packagedItems, portalItems } from './portal-items';

export type MenuActionId =
  | 'start'
  | 'stop'
  | 'open-studio'
  | 'connect-portal'
  | 'disconnect-portal'
  | 'open-update'
  | 'setup'
  | 'uninstall'
  | 'quit';

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
  /** The menu language, resolved once from the Mac's preferred languages. */
  readonly locale: ShellLocale;
  /** Tests fix it; production leaves it undefined for the local zone. */
  readonly timeZone?: string;
  /** The portal entries (ticket 07); absent means the section is not shown. */
  readonly portal?: PortalMenuState;
  /** Packaged app: adds "Set up / Repair" and "Uninstall"; development leaves it false or absent. */
  readonly packaged?: boolean;
}

function watcherLine(status: WatcherStatus, labels: ShellLabels): string {
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

function scheduleLines(summary: ScheduleSummary, labels: ShellLabels, locale: ShellLocale, timeZone: string | undefined): string[] {
  if (summary.status === 'unavailable') return [labels.schedulesUnavailable];
  const lines = [summary.nextSlotAtMs === null ? labels.noActiveSchedule : `${labels.nextSlotPrefix}${formatSlot(summary.nextSlotAtMs, locale, timeZone)}`];
  if (summary.skipped > 0) lines.push(`${labels.unreadableSchedulesPrefix}${summary.skipped}`);
  return lines;
}

function reviewLines(summary: ReviewSummary, labels: ShellLabels): string[] {
  if (summary.status === 'unavailable') return [labels.reviewUnavailable];
  const lines = [`${labels.reviewPrefix}${summary.count}`];
  if (summary.skipped > 0) lines.push(`${labels.unreadableRunsPrefix}${summary.skipped}`);
  return lines;
}

function reportLine(report: ActionReport, labels: ShellLabels): string {
  const starting = report.action === 'start';
  switch (report.outcome.kind) {
    case 'succeeded':
      return starting ? labels.startSucceeded : labels.stopSucceeded;
    case 'dependency-unavailable':
      return starting ? labels.startDependency : labels.stopDependency;
    case 'failed': {
      const prefix = starting ? labels.startFailedPrefix : labels.stopFailedPrefix;
      return report.outcome.exitCode === null ? prefix : labels.exitCode(prefix, report.outcome.exitCode);
    }
  }
}

/** The line under the actions: progress while one runs, the last result after it ends. */
function actionLine(action: InvokerStatus, labels: ShellLabels): string | null {
  switch (action.phase) {
    case 'running':
      return action.action === 'start' ? labels.starting : labels.stopping;
    case 'unresponsive':
      return action.action === 'start' ? labels.startNoResponse : labels.stopNoResponse;
    case 'idle':
      return action.last === null ? null : reportLine(action.last, labels);
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
  const labels = shellLabels[view.locale];
  const info = (label: string): MenuItemModel => ({ kind: 'info', label });
  const items: MenuItemModel[] = [
    info(watcherLine(state.watcher, labels)),
    info(serviceLine(state.api, { running: labels.apiRunning, stopped: labels.apiStopped, unknown: labels.apiUnknown })),
    info(serviceLine(state.web, { running: labels.webRunning, stopped: labels.webStopped, unknown: labels.webUnknown })),
    { kind: 'separator' },
    ...scheduleLines(state.schedules, labels, view.locale, view.timeZone).map(info),
    ...reviewLines(state.reviews, labels).map(info),
    { kind: 'separator' },
    { kind: 'action', id: 'start', label: labels.start, enabled: isStartEnabled(state, action) },
    { kind: 'action', id: 'stop', label: labels.stop, enabled: isStopEnabled(state, action) },
  ];
  const line = actionLine(action, labels);
  if (line !== null) items.push(info(line));
  items.push({ kind: 'action', id: 'open-studio', label: labels.openStudio, enabled: isOpenStudioEnabled(state) });
  if (view.portal !== undefined) items.push({ kind: 'separator' }, ...portalItems(view.portal, state.api, labels));
  items.push({ kind: 'separator' }, { kind: 'checkbox', id: 'open-at-login', label: labels.openAtLogin, checked: view.openAtLogin });
  if (view.packaged === true) items.push(...packagedItems(labels));
  items.push({ kind: 'action', id: 'quit', label: labels.quit, enabled: true });
  return items;
}

/** Shown when `shell-config.json` is missing or invalid: one disabled line and "Sair", no action. */
export function buildIncompleteInstallationMenu(locale: ShellLocale): MenuItemModel[] {
  const labels = shellLabels[locale];
  return [
    { kind: 'info', label: labels.incompleteInstallation },
    { kind: 'separator' },
    { kind: 'action', id: 'quit', label: labels.quit, enabled: true },
  ];
}
