import { type OptionalComponentId, type SetupStepId, type StepFailureReason } from './setup-types';

/*
 * K7, as in `logging/diagnostics.ts`: no log file, one JSON line per event on stderr, ids only. The
 * types admit no free text, so a path, a passphrase, a URL or command output cannot be passed in.
 */

export type SetupLogEvent =
  | 'setup-refused'
  | 'setup-started'
  | 'step-already-done'
  | 'step-done'
  | 'step-warning'
  | 'step-failed'
  | 'setup-complete'
  | 'setup-failed'
  | 'download-declined'
  /** The menu's Start was answered by running setup, because the last setup run did not complete. */
  | 'start-deferred'
  | 'uninstall-started'
  | 'uninstall-step-failed'
  | 'uninstall-finished';

export type UninstallPart = 'services' | 'watcher-agent' | 'login-item' | 'data-home' | 'app';

export interface SetupLogEntry {
  readonly event: SetupLogEvent;
  readonly step?: SetupStepId;
  readonly reason?: StepFailureReason | 'translocated' | 'disk-image';
  readonly component?: OptionalComponentId;
  readonly part?: UninstallPart;
}

export type SetupLogger = (entry: SetupLogEntry) => void;

export const stderrSetupLogger: SetupLogger = (entry: SetupLogEntry): void => {
  process.stderr.write(`${JSON.stringify({ component: 'shell-setup', ...entry })}\n`);
};
