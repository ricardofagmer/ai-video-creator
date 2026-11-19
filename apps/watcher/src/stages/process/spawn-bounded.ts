import { spawn } from 'node:child_process';

/** Grace between SIGTERM and SIGKILL of an aborted child's process group. */
const KILL_GRACE_MS = 5_000;
const STDERR_TAIL_CHARS = 4_000;

export interface BoundedSpawnRequest {
  command: string;
  /** Fixed argv; no shell ever parses it. */
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  /** Step signal combined with the command timeout (`limits.commandTimeoutMs`). */
  signal: AbortSignal;
  stdin: string | null;
  maxStdoutBytes: number;
}

export type BoundedSpawnOutcome =
  | { status: 'exited'; exitCode: number; stdout: string; stderrTail: string }
  | { status: 'aborted'; stderrTail: string }
  | { status: 'spawn-failed'; code: string }
  | { status: 'output-too-large' };

/**
 * Starts one child without a shell, with the caller's explicit environment, in its own process
 * group (`detached`), so an abort ends the child and every process it started (ffmpeg under the
 * tool runner, Chromium under Playwright or Remotion). Stdout is capped; only the stderr tail is
 * kept, and it never goes into a run file because it can echo paths.
 */
export function spawnBounded(request: BoundedSpawnRequest): Promise<BoundedSpawnOutcome> {
  return new Promise((resolve) => {
    if (request.signal.aborted) {
      resolve({ status: 'aborted', stderrTail: '' });
      return;
    }
    const child = spawn(request.command, [...request.args], {
      env: request.env,
      shell: false,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrTail = '';
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;

    const killGroup = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        // ESRCH: the group already exited between the check and the kill; nothing is left to stop.
        if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
      }
    };
    const finish = (outcome: BoundedSpawnOutcome): void => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener('abort', onAbort);
      if (killTimer !== null) clearTimeout(killTimer);
      resolve(outcome);
    };
    const onAbort = (): void => {
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref();
    };
    request.signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > request.maxStdoutBytes) {
        onAbort();
        finish({ status: 'output-too-large' });
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-STDERR_TAIL_CHARS);
    });
    child.on('error', (error) => {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
      finish({ status: 'spawn-failed', code });
    });
    child.on('close', (exitCode) => {
      if (request.signal.aborted) {
        finish({ status: 'aborted', stderrTail });
        return;
      }
      finish({ status: 'exited', exitCode: exitCode ?? -1, stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderrTail });
    });
    child.stdin.on('error', () => {
      // EPIPE when the child exits before reading stdin; the close handler reports the exit.
    });
    child.stdin.end(request.stdin ?? '');
  });
}

/** The step signal plus the command timeout: whichever fires first stops the child. */
export function commandSignal(stepSignal: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([stepSignal, AbortSignal.timeout(timeoutMs)]);
}
