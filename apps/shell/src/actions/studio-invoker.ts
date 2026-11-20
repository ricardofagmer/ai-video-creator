import { dirname } from 'node:path';
import { type ShellConfig } from '../config/shell-config';
import { buildChildEnvironment } from './child-environment';

export type StudioAction = 'start' | 'stop';

/** Exit codes of `tools/cli/src/errors/exit-codes.ts`: 0 ok, 5 a dependency is unavailable. */
export const CLI_EXIT_OK = 0;
export const CLI_EXIT_DEPENDENCY = 5;

/** A child still running after this is reported as unresponsive; it is never killed. */
export const UNRESPONSIVE_AFTER_MS = 60_000;

export type ActionOutcome =
  | { kind: 'succeeded' }
  | { kind: 'dependency-unavailable' }
  | { kind: 'failed'; exitCode: number | null };

export interface ActionReport {
  readonly action: StudioAction;
  readonly outcome: ActionOutcome;
}

/**
 * One action at a time. `unresponsive` keeps the action in flight until the child exits, so two
 * `studio` invocations never overlap, and the menu says the child has not answered.
 */
export type InvokerStatus =
  | { phase: 'idle'; last: ActionReport | null }
  | { phase: 'running'; action: StudioAction }
  | { phase: 'unresponsive'; action: StudioAction };

export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly shell: false;
}

export type ProcessExit = { kind: 'exited'; code: number | null } | { kind: 'spawn-error' };

/** The spawned child as the invoker sees it: it can only be waited on, never signalled. */
export interface SpawnedProcess {
  onceSettled(listener: (exit: ProcessExit) => void): void;
}

export type Spawner = (request: SpawnRequest) => SpawnedProcess;

/** Returns a cancel function. */
export type StartTimer = (delayMs: number, callback: () => void) => () => void;

export type ActionRequest =
  | { status: 'accepted'; completion: Promise<ActionReport> }
  | { status: 'refused'; reason: 'action-in-flight' };

export interface StudioInvokerOptions {
  readonly config: Pick<ShellConfig, 'nodeBinary' | 'cliMain' | 'dataHome' | 'webPort' | 'apiPort'>;
  readonly parentEnvironment: Readonly<Record<string, string | undefined>>;
  readonly spawner: Spawner;
  readonly startTimer: StartTimer;
}

/** Maps the CLI's exit to the three outcomes the menu distinguishes. */
export function outcomeOfExit(exit: ProcessExit): ActionOutcome {
  if (exit.kind === 'spawn-error') return { kind: 'failed', exitCode: null };
  if (exit.code === CLI_EXIT_OK) return { kind: 'succeeded' };
  if (exit.code === CLI_EXIT_DEPENDENCY) return { kind: 'dependency-unavailable' };
  return { kind: 'failed', exitCode: exit.code };
}

/**
 * Runs `<nodeBinary> <cliMain> start|stop` with an argument array, no shell and an allowlisted
 * environment. No argument comes from file content, menu text or user input. The CLI's output is
 * discarded by the spawner: it may carry paths and URLs (K7).
 */
export class StudioInvoker {
  private status: InvokerStatus = { phase: 'idle', last: null };
  private readonly listeners: Array<(status: InvokerStatus) => void> = [];

  constructor(private readonly options: StudioInvokerOptions) {}

  current(): InvokerStatus {
    return this.status;
  }

  subscribe(listener: (status: InvokerStatus) => void): void {
    this.listeners.push(listener);
  }

  request(action: StudioAction): ActionRequest {
    if (this.status.phase !== 'idle') return { status: 'refused', reason: 'action-in-flight' };
    this.setStatus({ phase: 'running', action });
    return { status: 'accepted', completion: this.run(action) };
  }

  private run(action: StudioAction): Promise<ActionReport> {
    const { config, parentEnvironment, spawner, startTimer } = this.options;
    const request: SpawnRequest = {
      command: config.nodeBinary,
      args: [config.cliMain, action],
      cwd: dirname(config.cliMain),
      env: buildChildEnvironment(config, parentEnvironment),
      shell: false,
    };
    return new Promise<ActionReport>((resolve) => {
      let settled = false;
      const cancelTimer = startTimer(UNRESPONSIVE_AFTER_MS, () => {
        if (!settled) this.setStatus({ phase: 'unresponsive', action });
      });
      const finish = (exit: ProcessExit): void => {
        if (settled) return;
        settled = true;
        cancelTimer();
        const report: ActionReport = { action, outcome: outcomeOfExit(exit) };
        this.setStatus({ phase: 'idle', last: report });
        resolve(report);
      };
      try {
        spawner(request).onceSettled(finish);
      } catch {
        finish({ kind: 'spawn-error' });
      }
    });
  }

  private setStatus(status: InvokerStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}
