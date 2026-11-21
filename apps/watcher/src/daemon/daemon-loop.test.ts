import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { Logger } from '@nestjs/common';
import { type Clock } from '../engine/clock';
import { type RunExecutionResult } from '../engine/run-engine';
import { BusyIntervalTracker } from '../schedules/busy-interval.tracker';
import { DaemonLoop } from './daemon-loop';
import { type RunCandidate } from './run-classification';

/*
 * The daemon loop's idle ordering and busy record (SPEC 0006 section 5.6, B5, R3-AC-14): a run
 * execution is recorded in the real `BusyIntervalTracker`, so a slot that fell due during it is
 * `watcher-busy` and not `watcher-not-running`; on a `none` scan the schedule step is evaluated
 * before curations; a failed `runs/` scan evaluates nothing. Every collaborator but the tracker is
 * an in-memory fake; the scripted scanner fires the shutdown signal on its last scan, so the loop
 * ends after that iteration and no real timer is waited on.
 */

type LoopCall = 'sweep' | 'scan' | 'execute' | 'schedules' | 'curations';

const start = Date.parse('2026-11-20T11:00:00.000Z');
const minuteMs = 60_000;
const RUN_DURATION_MS = 10 * minuteMs;
const RUN_ID = '01JD0000000000000000000000';

class SteppingClock implements Clock {
  constructor(private nowMs: number) {}

  now(): Date {
    return new Date(this.nowMs);
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }
}

/** One answer per scan: a list of candidates, or an error the scan throws. */
type ScanAnswer = RunCandidate[] | Error;

class LoopFakes {
  readonly calls: LoopCall[] = [];
  readonly shutdown = new AbortController();
  readonly clock = new SteppingClock(start);
  readonly busy = new BusyIntervalTracker(this.clock);
  /** Popped per evaluation; an empty queue answers false. */
  readonly scheduleAnswers: boolean[] = [];
  /** Popped per claim; an empty queue answers false (nothing claimed). */
  readonly curationAnswers: boolean[] = [];
  /** `wasBusyAt` of each probe instant, seen by the schedule step when it was evaluated. */
  readonly busySeenBySchedules: boolean[][] = [];
  probeInstants: Date[] = [];
  private scansLeft: ScanAnswer[];

  constructor(scans: ScanAnswer[]) {
    this.scansLeft = [...scans];
  }

  readonly scanner = {
    scan: async (): Promise<RunCandidate[]> => {
      this.calls.push('scan');
      const answer = this.scansLeft.shift() ?? [];
      if (this.scansLeft.length === 0) this.shutdown.abort();
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };

  readonly engine = {
    execute: async (): Promise<RunExecutionResult> => {
      this.calls.push('execute');
      this.clock.advance(RUN_DURATION_MS);
      return { runId: RUN_ID, status: 'review' };
    },
  };

  readonly schedules = {
    evaluate: async (): Promise<boolean> => {
      this.calls.push('schedules');
      this.busySeenBySchedules.push(this.probeInstants.map((instant) => this.busy.wasBusyAt(instant)));
      return this.scheduleAnswers.shift() ?? false;
    },
  };

  readonly curations = {
    sweepStale: async (): Promise<void> => {
      this.calls.push('sweep');
    },
    claimNext: async (): Promise<boolean> => {
      this.calls.push('curations');
      const ran = this.curationAnswers.shift() ?? false;
      if (ran) this.clock.advance(RUN_DURATION_MS);
      return ran;
    },
  };

  /** The platform steps are required collaborators (finding C11); here they never find work (their order is `daemon-loop.platform-steps.test.ts`). */
  readonly publish = {
    sweep: async (): Promise<void> => undefined,
    claimNext: async (): Promise<boolean> => false,
  };

  readonly metricsPoll = {
    run: async (): Promise<boolean> => false,
  };

  loop(): DaemonLoop {
    return new DaemonLoop(this.engine, this.scanner, this.curations, this.schedules, this.busy, this.shutdown.signal, this.publish, this.metricsPoll);
  }
}

function pendingCandidate(runId: string): RunCandidate {
  return { runId, runDir: `/data-home/runs/${runId}`, trigger: 'pending' };
}

describe('DaemonLoop', () => {
  before(() => {
    // The loop logs every scan outcome; the assertions read the fakes, not the console.
    Logger.overrideLogger(false);
  });

  it('records a run execution as busy, so a slot due during it is seen as watcher-busy (R3-AC-14)', async () => {
    const fakes = new LoopFakes([[pendingCandidate(RUN_ID)], []]);
    const slotDuringRun = new Date(start + RUN_DURATION_MS / 2);
    const slotAfterRun = new Date(start + RUN_DURATION_MS + minuteMs);
    fakes.probeInstants = [slotDuringRun, slotAfterRun];

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['sweep', 'scan', 'execute', 'scan', 'schedules', 'curations']);
    assert.equal(fakes.busy.wasBusyAt(slotDuringRun), true, 'the run interval was recorded');
    assert.deepEqual(fakes.busySeenBySchedules, [[true, false]], 'the schedule step, evaluated after the run, sees its interval');
  });

  it('records a curation as busy only when it ran', async () => {
    const fakes = new LoopFakes([[], []]);
    fakes.curationAnswers.push(true, false);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['sweep', 'scan', 'schedules', 'curations', 'scan', 'schedules', 'curations']);
    assert.equal(fakes.busy.wasBusyAt(new Date(start + RUN_DURATION_MS / 2)), true, 'the curation that ran was recorded');
    assert.equal(fakes.busy.wasBusyAt(new Date(start + RUN_DURATION_MS + minuteMs)), false, 'the empty claim was not');
  });

  it('evaluates schedules before curations on a scan that found no startable run (B5)', async () => {
    const fakes = new LoopFakes([[]]);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['sweep', 'scan', 'schedules', 'curations']);
  });

  it('scans runs again at once, before any curation, when a slot fired', async () => {
    const fakes = new LoopFakes([[], [pendingCandidate(RUN_ID)]]);
    fakes.scheduleAnswers.push(true);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['sweep', 'scan', 'schedules', 'scan', 'execute']);
  });

  it('evaluates no schedule and claims no curation after a failed runs/ scan', async () => {
    const fakes = new LoopFakes([new Error('runs/ unreadable')]);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['sweep', 'scan']);
    assert.deepEqual(fakes.busySeenBySchedules, []);
  });
});
