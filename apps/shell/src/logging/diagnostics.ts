import { type StudioAction } from '../actions/studio-invoker';
import { type ShellConfigErrorReason } from '../config/shell-config';

/*
 * K7: the shell writes no log file. One JSON line per event goes to stderr, carrying an event id,
 * reason ids, an action, an exit code and counts only. The types admit no free text, so a path, a
 * URL, a file name, a schedule title or brief text cannot be passed in.
 */

export type DiagnosticEvent =
  | 'shell-started'
  | 'second-instance-quit'
  | 'config-invalid'
  | 'startup-failed'
  | 'refresh-failed'
  | 'schedules-skipped'
  | 'runs-skipped'
  | 'action-started'
  | 'action-refused'
  | 'action-unresponsive'
  | 'action-finished'
  | 'open-studio-failed'
  | 'login-item-changed'
  | 'login-item-failed';

export type DiagnosticReason =
  | ShellConfigErrorReason
  | 'fast-inputs'
  | 'slow-inputs'
  | 'action-in-flight'
  | 'succeeded'
  | 'dependency-unavailable'
  | 'failed'
  | 'unexpected-error';

export interface DiagnosticEntry {
  readonly event: DiagnosticEvent;
  readonly reason?: DiagnosticReason;
  readonly action?: StudioAction;
  readonly exitCode?: number | null;
  readonly counts?: Readonly<Record<string, number>>;
  readonly enabled?: boolean;
}

export function logDiagnostic(entry: DiagnosticEntry): void {
  process.stderr.write(`${JSON.stringify({ component: 'shell', ...entry })}\n`);
}
