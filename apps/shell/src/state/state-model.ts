import { WATCHER_HEARTBEAT_STALE_AFTER_MS } from '@studio/shared/run-format';
import { type HeartbeatInput } from './heartbeat-input';
import { type PidRecordRead } from './pid-record';
import { type ReviewSummary } from './review-summary';
import { type ScheduleSummary } from './schedule-summary';

export type WatcherStatus = 'alive' | 'dead' | 'absent';
export type ServiceStatus = 'running' | 'stopped' | 'unknown';

/** Read every 5 s: cheap, and what "Iniciar" / "Parar" depend on. */
export interface FastInputs {
  readonly heartbeat: HeartbeatInput;
  readonly api: PidRecordRead;
  readonly web: PidRecordRead;
}

/** Read every 60 s and when the menu opens: they walk folders. */
export interface SlowInputs {
  readonly schedules: ScheduleSummary;
  readonly reviews: ReviewSummary;
}

export interface ShellState {
  readonly watcher: WatcherStatus;
  readonly api: ServiceStatus;
  readonly web: ServiceStatus;
  readonly schedules: ScheduleSummary;
  readonly reviews: ReviewSummary;
}

/** Injected so tests fix the instant and the liveness answer. */
export interface StateProbes {
  readonly nowMs: number;
  /** Signal-0 check (`isProcessAlive` of `@studio/shared/run-files` in production). */
  readonly isProcessAlive: (pid: number) => boolean;
}

/** Fresh within the shared limit in either direction; older or further in the future reads `dead` (A19, A20). */
export function watcherStatusOf(heartbeat: HeartbeatInput, nowMs: number): WatcherStatus {
  switch (heartbeat.kind) {
    case 'absent':
      return 'absent';
    case 'unreadable':
      return 'dead';
    case 'present': {
      const atMs = Date.parse(heartbeat.at);
      if (Number.isNaN(atMs)) return 'dead';
      return Math.abs(nowMs - atMs) <= WATCHER_HEARTBEAT_STALE_AFTER_MS ? 'alive' : 'dead';
    }
  }
}

/** `running` only for a valid record whose pid is alive; an invalid record is `unknown`, never trusted. */
export function serviceStatusOf(record: PidRecordRead, isProcessAlive: (pid: number) => boolean): ServiceStatus {
  switch (record.status) {
    case 'absent':
      return 'stopped';
    case 'invalid':
      return 'unknown';
    case 'present':
      try {
        return isProcessAlive(record.record.pid) ? 'running' : 'stopped';
      } catch {
        // A liveness error other than "no such process" or "not permitted" proves nothing either way.
        return 'unknown';
      }
  }
}

/** The one pure function the timer feeds: file facts plus clock and liveness in, displayed state out. */
export function deriveShellState(fast: FastInputs, slow: SlowInputs, probes: StateProbes): ShellState {
  return {
    watcher: watcherStatusOf(fast.heartbeat, probes.nowMs),
    api: serviceStatusOf(fast.api, probes.isProcessAlive),
    web: serviceStatusOf(fast.web, probes.isProcessAlive),
    schedules: slow.schedules,
    reviews: slow.reviews,
  };
}
