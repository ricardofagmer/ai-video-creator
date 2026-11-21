import { spawn } from 'node:child_process';
import { HyperframesProcessStartError } from './errors';

/*
 * The only way a HyperFrames process starts (SPEC 0008 section 4.4, AC 66). Callers build the
 * command, argv, cwd and environment; the port runs them and reports the exit code. Tests use
 * `FakeHyperframesProcessPort` and never start a process (K11).
 */

export interface HyperframesProcessRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
}

export interface HyperframesProcessPort {
  run(request: HyperframesProcessRequest): Promise<{ exitCode: number }>;
}

/** Exit code reported when the child ended by a signal (an abort), mirroring the shell's 128+n. */
const SIGNAL_EXIT_BASE = 128;
const SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };

function errorCodeOf(error: Error): string {
  return 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
}

/**
 * The real adapter: `spawn` with no shell, an explicit cwd and environment, and no detach, so the
 * child stays in the caller's process group and an abort of the tool runner ends it with its
 * Chrome (`spawn-bounded.ts`). The child's stdout and stderr both go to the parent's stderr: the
 * parent's stdout may carry a protocol answer, and nothing of the child is captured or logged.
 */
export function createSpawnProcessPort(options: { signal?: AbortSignal } = {}): HyperframesProcessPort {
  return {
    run(request: HyperframesProcessRequest): Promise<{ exitCode: number }> {
      return new Promise((resolve, reject) => {
        const child = spawn(request.command, [...request.args], {
          cwd: request.cwd,
          env: { ...request.env },
          shell: false,
          stdio: ['ignore', 2, 2],
          windowsHide: true,
          ...(options.signal === undefined ? {} : { signal: options.signal, killSignal: 'SIGTERM' }),
        });
        let settled = false;
        child.once('error', (error: Error) => {
          if (settled) return;
          // An abort also arrives here once the child has started; its exit is reported by `close`.
          if (error.name === 'AbortError' && child.pid !== undefined) return;
          settled = true;
          reject(new HyperframesProcessStartError(errorCodeOf(error)));
        });
        child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
          if (settled) return;
          settled = true;
          const exitCode = code ?? SIGNAL_EXIT_BASE + (signal === null ? 0 : (SIGNAL_NUMBERS[signal] ?? 0));
          resolve({ exitCode });
        });
      });
    },
  };
}
