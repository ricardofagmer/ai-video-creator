import { spawn, type ChildProcess } from 'node:child_process';

/*
 * The setup steps' only way to start a program: an absolute executable, an argument array, no
 * shell, an explicit environment. No argument ever comes from text the user typed; the passphrase
 * travels on stdin only (plan section 5 step 4).
 */

export interface ProcessRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  /**
   * Written to the child's stdin, which is then closed. The runner overwrites the buffer with zeros
   * once the write finished or failed, so the caller's copy is gone too.
   */
  readonly stdin?: Buffer;
  /** Keep stdout in memory, bounded, for the caller to parse; it is never logged or shown. */
  readonly captureStdout?: boolean;
}

export type ProcessResult = { readonly kind: 'exited'; readonly code: number | null; readonly stdout: string } | { readonly kind: 'spawn-error' };

export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

/** `launchctl print` and Playwright's dry run fit easily; anything longer is cut, never buffered unbounded. */
export const MAX_CAPTURED_STDOUT_BYTES = 64 * 1024;

function wipe(buffer: Buffer | undefined): void {
  buffer?.fill(0);
}

/** Production runner. stderr is always discarded: CLI output may carry paths and URLs (K7). */
export const nodeProcessRunner: ProcessRunner = (request: ProcessRequest): Promise<ProcessResult> =>
  new Promise<ProcessResult>((resolve) => {
    const chunks: Buffer[] = [];
    let captured = 0;
    let settled = false;
    const settle = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      wipe(request.stdin);
      resolve(result);
    };
    let child: ChildProcess;
    try {
      child = spawn(request.command, [...request.args], {
        cwd: request.cwd,
        env: { ...request.env },
        shell: false,
        stdio: [request.stdin === undefined ? 'ignore' : 'pipe', request.captureStdout === true ? 'pipe' : 'ignore', 'ignore'],
      });
    } catch {
      settle({ kind: 'spawn-error' });
      return;
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      if (captured >= MAX_CAPTURED_STDOUT_BYTES) return;
      const kept = chunk.subarray(0, MAX_CAPTURED_STDOUT_BYTES - captured);
      captured += kept.length;
      chunks.push(kept);
    });
    child.once('error', () => settle({ kind: 'spawn-error' }));
    child.once('close', (code: number | null) => settle({ kind: 'exited', code, stdout: Buffer.concat(chunks).toString('utf8') }));
    const input = child.stdin;
    if (input !== null && request.stdin !== undefined) {
      // A child that exits before reading closes the pipe; the error is the exit's to report.
      input.on('error', () => wipe(request.stdin));
      input.end(request.stdin, () => wipe(request.stdin));
    }
  });
