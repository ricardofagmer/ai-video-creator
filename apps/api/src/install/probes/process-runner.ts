import { execFile } from 'node:child_process';

/** What running a fixed argv produced; output is never kept, logged or returned. */
export type ProcessOutcome = { status: 'exited-ok' } | { status: 'failed' } | { status: 'not-found' };

export interface ProbeProcessRunner {
  /** Runs `command` with `args`, no shell, the given environment only, and a short timeout. */
  run(command: string, args: readonly string[], environment: Readonly<Record<string, string>>): Promise<ProcessOutcome>;
}

export const PROBE_PROCESS_RUNNER = Symbol('PROBE_PROCESS_RUNNER');

const PROBE_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 256 * 1024;

/** `execFile` with no shell and the caller's minimal environment, never `process.env`. */
export const execFileProcessRunner: ProbeProcessRunner = {
  run: (command, args, environment) =>
    new Promise((resolve) => {
      execFile(
        command,
        [...args],
        { timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, shell: false, windowsHide: true, env: { ...environment } },
        (error) => {
          if (error === null) {
            resolve({ status: 'exited-ok' });
            return;
          }
          resolve({ status: 'code' in error && error.code === 'ENOENT' ? 'not-found' : 'failed' });
        },
      );
    }),
};
