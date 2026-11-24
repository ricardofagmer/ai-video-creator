import 'reflect-metadata';
import { dirname } from 'node:path';
import { mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { type Clock } from '../../engine/clock';
import { RunEngine, type RunExecutionResult } from '../../engine/run-engine';
import { BusyIntervalTracker } from '../../schedules/busy-interval.tracker';
import { startMockEngine, stubProcessIdentity, type MockEngineHandle } from '../../test-support';
import { DaemonLoop } from '../daemon-loop';
import { type RunCandidate } from '../run-classification';
import { RunScanner } from '../run-scanner';

/*
 * Shared helpers of the daemon tests (ticket 03): no test is registered here; the `.test.ts` name
 * keeps the file inside the isolation scan, as `composition-stage.harness.test.ts` does.
 *
 * A "daemon world" is the real `DaemonLoop` driving the real `RunScanner` and the real `RunEngine`
 * of `startMockEngine` (spec rev 1 section 8.2) over the harness working copy of the fixture run.
 * Only the idle steps (publish, schedules, metrics poll, curations) are fakes that never find work,
 * because they own folders the run pickup does not read. Each round fires the shutdown signal
 * during its last scan, so the loop ends after that iteration and never waits a real poll
 * interval. Nothing reads the owner's data home: the scanner's `DataHome` points at the harness
 * temp root, where `startMockEngine` keeps the run folder.
 */

/** A pid that is not this process, so a stubbed daemon and this live process are different owners. */
export const DAEMON_PID = process.pid === 424_242 ? 424_243 : 424_242;

const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];
const BUSY_CLOCK_AT = new Date('2026-11-21T12:00:00.000Z');

export type LogLevel = (typeof logLevels)[number];

export interface LoggedLine {
  level: LogLevel;
  message: unknown;
}

export interface LoggedEvent {
  level: LogLevel;
  fields: Record<string, unknown>;
}

export type ExecutionOutcome = { status: 'returned'; result: RunExecutionResult } | { status: 'threw'; error: unknown };

export interface DaemonExecution {
  /** The folder the loop handed to `RunEngine.execute`. */
  runDir: string;
  outcome: ExecutionOutcome;
}

export interface DaemonRound {
  /** What each scan returned, in order. */
  scans: RunCandidate[][];
  executions: DaemonExecution[];
}

export interface DaemonRoundOptions {
  /** Scans in this round; the shutdown signal fires during the last one. */
  scans: number;
  /** Runs before each scan (0-based index), e.g. to change the run folder between two scans. */
  beforeScan?: (scanIndex: number) => Promise<void>;
}

export interface DaemonWorld {
  handle: MockEngineHandle;
  runDir: string;
  /** This test process's real pid, read before any stub: a live process of this user that is not the daemon. */
  livePid: number;
  /** The pid the engine (`WATCHER_PROCESS`) and the scanner (`DAEMON_PROCESS`) run as. */
  daemonPid: number;
  runDaemon(options: DaemonRoundOptions): Promise<DaemonRound>;
  /** Shuts the engine down, removes its temp root and restores `process.pid`. */
  close(): Promise<void>;
}

type MockEngineOptions = NonNullable<Parameters<typeof startMockEngine>[0]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Records every Logger line instead of printing it; `mock.restoreAll()` in `afterEach` undoes it. */
export function captureLogs(): LoggedLine[] {
  const lines: LoggedLine[] = [];
  for (const level of logLevels) {
    mock.method(Logger.prototype, level, (message: unknown): void => {
      lines.push({ level, message });
    });
  }
  return lines;
}

/** Structured lines whose `event` field is `event`. */
export function loggedEvents(lines: readonly LoggedLine[], event: string): LoggedEvent[] {
  return lines.flatMap((line): LoggedEvent[] =>
    isRecord(line.message) && line.message['event'] === event ? [{ level: line.level, fields: line.message }] : [],
  );
}

/**
 * The real data home with `runs` redirected to the harness temp root. `RunScanner` reads only
 * `runs`; the other paths are never touched.
 */
function harnessDataHome(runsRoot: string): DataHome {
  const base = new DataHome(dirname(runsRoot));
  return { ...base, runs: runsRoot, embeddingModelDirectory: (modelRef: string): string => base.embeddingModelDirectory(modelRef) };
}

const idleCurations = {
  sweepStale: async (): Promise<void> => undefined,
  claimNext: async (): Promise<boolean> => false,
};

const idleSchedules = {
  evaluate: async (): Promise<boolean> => false,
};

const idlePublish = {
  sweep: async (): Promise<void> => undefined,
  claimNext: async (): Promise<boolean> => false,
};

const idleMetricsPoll = {
  run: async (): Promise<boolean> => false,
};

const busyClock: Clock = { now: () => BUSY_CLOCK_AT };

/**
 * Starts the mock engine on a working copy of the fixture run. With `asDaemonPid` the process
 * identity is stubbed BEFORE the engine's module graph is built, so the engine and the scanner run
 * as that pid while this process (`livePid`) stays a live process that is not the daemon.
 */
export async function startDaemonWorld(options: { asDaemonPid?: number; engine?: MockEngineOptions } = {}): Promise<DaemonWorld> {
  const livePid = process.pid;
  const restore = options.asDaemonPid === undefined ? (): void => undefined : stubProcessIdentity(options.asDaemonPid);
  let handle: MockEngineHandle;
  try {
    handle = await startMockEngine(options.engine);
  } catch (error) {
    restore();
    throw error;
  }
  const daemonPid = process.pid;
  const scanner = new RunScanner(harnessDataHome(dirname(handle.runDir)), { pid: daemonPid });
  const engine = handle.app.get(RunEngine);

  const runDaemon = async ({ scans, beforeScan }: DaemonRoundOptions): Promise<DaemonRound> => {
    if (!Number.isSafeInteger(scans) || scans < 1) throw new RangeError('a daemon round needs at least one scan');
    const shutdown = new AbortController();
    const round: DaemonRound = { scans: [], executions: [] };
    const recordingScanner = {
      scan: async (): Promise<RunCandidate[]> => {
        await beforeScan?.(round.scans.length);
        // Fired before the last scan returns: the loop finishes the iteration it starts, then stops.
        if (round.scans.length + 1 >= scans) shutdown.abort();
        const candidates = await scanner.scan();
        round.scans.push(candidates);
        return candidates;
      },
    };
    const recordingEngine = {
      execute: async (runDir: string): Promise<RunExecutionResult> => {
        try {
          const result = await engine.execute(runDir);
          round.executions.push({ runDir, outcome: { status: 'returned', result } });
          return result;
        } catch (error) {
          round.executions.push({ runDir, outcome: { status: 'threw', error } });
          throw error;
        }
      },
    };
    const loop = new DaemonLoop(
      recordingEngine,
      recordingScanner,
      idleCurations,
      idleSchedules,
      new BusyIntervalTracker(busyClock),
      shutdown.signal,
      idlePublish,
      idleMetricsPoll,
    );
    await loop.run();
    return round;
  };

  return {
    handle,
    runDir: handle.runDir,
    livePid,
    daemonPid,
    runDaemon,
    close: async (): Promise<void> => {
      try {
        await handle.shutdown();
      } finally {
        restore();
      }
    },
  };
}
