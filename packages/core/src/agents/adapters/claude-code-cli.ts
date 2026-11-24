import { spawn } from 'node:child_process';

/** One finished CLI process. Output is capped; `truncated` means the cap was reached. */
export interface ClaudeCodeProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  /** The abort signal fired, or the deadline passed, before the process ended. */
  readonly aborted: boolean;
}

export interface ClaudeCodeProcessRequest {
  /** Absolute path, or a bare command name resolved on PATH. Never a shell line. */
  readonly binary: string;
  readonly args: readonly string[];
  readonly stdin: string;
  /** An empty folder: the CLI finds no project files, settings or instructions there. */
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  /** Epoch ms after which the process is stopped. */
  readonly deadlineMs: number;
}

/** The CLI is not installed, not on PATH, or not executable. */
export class ClaudeCodeNotFoundError extends Error {
  constructor() {
    super('The Claude Code CLI could not be started');
    this.name = 'ClaudeCodeNotFoundError';
  }
}

/** An answer plus its envelope is a few hundred kilobytes at most; anything larger is not one. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
/** Grace between asking the process to stop and forcing it. */
const KILL_GRACE_MS = 2_000;

/**
 * What the child may see (ADR 0011 decision 2). No `ANTHROPIC_*` variable is ever passed, so a
 * call cannot fall through to the API bill, and no studio secret reaches the CLI.
 */
const ENVIRONMENT_ALLOWLIST: readonly string[] = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR'];

export function childEnvironment(parent: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of ENVIRONMENT_ALLOWLIST) {
    const value = parent[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

class CappedBuffer {
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  truncated = false;

  push(chunk: Buffer): void {
    const room = MAX_OUTPUT_BYTES - this.bytes;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (kept.length < chunk.length) this.truncated = true;
    this.chunks.push(kept);
    this.bytes += kept.length;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

/**
 * Runs the CLI once: argument array, no shell, prompt on stdin. Resolves when the process ends,
 * whatever its exit code; rejects only with `ClaudeCodeNotFoundError` when it cannot start.
 */
export function runClaudeCode(request: ClaudeCodeProcessRequest): Promise<ClaudeCodeProcessResult> {
  return new Promise((resolve, reject) => {
    if (request.signal.aborted || Date.now() >= request.deadlineMs) {
      resolve({ exitCode: null, stdout: '', stderr: '', truncated: false, aborted: true });
      return;
    }
    const child = spawn(request.binary, [...request.args], {
      cwd: request.workingDirectory,
      env: childEnvironment(process.env),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = new CappedBuffer();
    const stderr = new CappedBuffer();
    let aborted = false;
    let forceTimer: NodeJS.Timeout | null = null;

    const stop = (): void => {
      if (aborted) return;
      aborted = true;
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
    };
    const deadlineTimer = setTimeout(stop, Math.max(request.deadlineMs - Date.now(), 0));
    request.signal.addEventListener('abort', stop, { once: true });
    const release = (): void => {
      clearTimeout(deadlineTimer);
      if (forceTimer !== null) clearTimeout(forceTimer);
      request.signal.removeEventListener('abort', stop);
    };

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    // A CLI that exits before reading its input closes the pipe; the exit code reports that.
    child.stdin.on('error', () => undefined);
    child.once('error', () => {
      release();
      reject(new ClaudeCodeNotFoundError());
    });
    child.once('close', (exitCode) => {
      release();
      resolve({ exitCode, stdout: stdout.text(), stderr: stderr.text(), truncated: stdout.truncated, aborted });
    });
    child.stdin.end(request.stdin);
  });
}
