import { join } from 'node:path';
import { type z } from 'zod';
import { type StageSettings } from '../shared/stage-settings';
import { minimalChildEnv } from './child-env';
import { commandSignal, spawnBounded } from './spawn-bounded';
import { RESULT_MARKER, ToolRunnerReplySchema, type RunnerErrorKind, type ToolRunnerRequest } from './tool-runner.protocol';

const MAX_RUNNER_STDOUT_BYTES = 8 * 1024 * 1024;

/** Loader flags tsx (dev) puts on the parent; only these reach the child, never `--env-file`. */
const loaderFlags: ReadonlySet<string> = new Set(['--require', '-r', '--import', '--loader', '--experimental-loader']);

export type ToolRunOutcome<T> =
  | { status: 'ok'; result: T }
  | { status: 'failed'; kind: RunnerErrorKind | 'timeout'; message: string };

export interface ToolRunOptions {
  /** The step signal (stop, step timeout). */
  signal: AbortSignal;
  /** `recipeStage.timeoutMs ?? limits.commandTimeoutMs`. */
  timeoutMs: number;
}

/**
 * Starts `tool-runner.main` as a separate Node process for every toolbox, Remotion and Playwright
 * call: fixed argv, no shell, the minimal environment, the request on stdin, and the step signal
 * plus the command timeout as its deadline. Running them in a child closes two toolbox gaps the
 * stages may not edit: `runTool` inherits `process.env` and takes no AbortSignal, and the toolbox
 * CLI loads the repository `.env`.
 */
export class ToolRunner {
  constructor(private readonly settings: StageSettings) {}

  async run<T>(request: ToolRunnerRequest, resultSchema: z.ZodType<T, z.ZodTypeDef, unknown>, options: ToolRunOptions): Promise<ToolRunOutcome<T>> {
    const signal = commandSignal(options.signal, options.timeoutMs);
    const outcome = await spawnBounded({
      command: process.execPath,
      args: [...runnerExecArgv(), runnerEntry()],
      env: minimalChildEnv(this.settings),
      signal,
      stdin: JSON.stringify(request),
      maxStdoutBytes: MAX_RUNNER_STDOUT_BYTES,
    });
    // A stop or step timeout is an interruption the engine owns; rethrow its reason unchanged.
    options.signal.throwIfAborted();
    switch (outcome.status) {
      case 'aborted':
        return { status: 'failed', kind: 'timeout', message: `${request.command} exceeded ${options.timeoutMs} ms` };
      case 'spawn-failed':
        return { status: 'failed', kind: 'internal', message: `tool runner could not start (${outcome.code})` };
      case 'output-too-large':
        return { status: 'failed', kind: 'internal', message: `${request.command} printed more than ${MAX_RUNNER_STDOUT_BYTES} bytes` };
      case 'exited':
        return parseReply(request.command, outcome.stdout, resultSchema);
    }
  }
}

function parseReply<T>(command: string, stdout: string, resultSchema: z.ZodType<T, z.ZodTypeDef, unknown>): ToolRunOutcome<T> {
  const line = stdout
    .split('\n')
    .reverse()
    .find((candidate) => candidate.startsWith(RESULT_MARKER));
  if (line === undefined) return { status: 'failed', kind: 'internal', message: `${command} returned no result` };
  let raw: unknown;
  try {
    raw = JSON.parse(line.slice(RESULT_MARKER.length));
  } catch (error) {
    if (error instanceof SyntaxError) return { status: 'failed', kind: 'internal', message: `${command} returned malformed JSON` };
    throw error;
  }
  const reply = ToolRunnerReplySchema.safeParse(raw);
  if (!reply.success) return { status: 'failed', kind: 'internal', message: `${command} returned an unexpected reply` };
  if (!reply.data.ok) return { status: 'failed', kind: reply.data.error.kind, message: reply.data.error.message };
  const result = resultSchema.safeParse(reply.data.result);
  if (!result.success) return { status: 'failed', kind: 'internal', message: `${command} result did not match its contract` };
  return { status: 'ok', result: result.data };
}

/** Compiled watcher: `tool-runner.main.js`; dev under tsx: the `.ts` source with tsx's loader flags. */
function runnerEntry(): string {
  return join(__dirname, __filename.endsWith('.ts') ? 'tool-runner.main.ts' : 'tool-runner.main.js');
}

function runnerExecArgv(): string[] {
  const kept: string[] = [];
  const argv = process.execArgv;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const [name] = flag.split('=', 1);
    if (name === undefined || !loaderFlags.has(name)) continue;
    kept.push(flag);
    const value = argv[index + 1];
    if (!flag.includes('=') && value !== undefined) {
      kept.push(value);
      index += 1;
    }
  }
  return kept;
}
