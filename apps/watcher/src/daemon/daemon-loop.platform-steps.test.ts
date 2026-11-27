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
 * The platform steps inside the daemon loop (SPEC 0007 section 5.5, OD5): `publish/` is swept once
 * at start, after the curation sweep and before the first scan; on a `none` scan the idle steps run
 * publish, schedules, metrics poll, curations; a claimed upload or a poll that called a platform
 * scans `runs/` again at once; both run under the real `BusyIntervalTracker`, recorded only when
 * they worked. Every other collaborator is an in-memory fake; the scripted scanner fires the
 * shutdown signal on its last scan, so the loop ends after that iteration and no timer is waited on.
 */

type LoopCall = 'curation-sweep' | 'publish-sweep' | 'scan' | 'execute' | 'publish' | 'schedules' | 'poll' | 'curations';

const start = Date.parse('2026-11-20T11:00:00.000Z');
const minuteMs = 60_000;
const WORK_MS = 5 * minuteMs;
const IDLE_MS = minuteMs;
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

class PlatformLoopFakes {
  readonly calls: LoopCall[] = [];
  readonly shutdown = new AbortController();
  readonly clock = new SteppingClock(start);
  readonly busy = new BusyIntervalTracker(this.clock);
  /** Popped per call; an empty queue answers false. A step that worked takes WORK_MS, one that did nothing IDLE_MS. */
  readonly publishAnswers: boolean[] = [];
  readonly pollAnswers: boolean[] = [];
  readonly scheduleAnswers: boolean[] = [];
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
      this.clock.advance(WORK_MS);
      return { runId: RUN_ID, status: 'review' };
    },
  };

  readonly schedules = {
    evaluate: async (): Promise<boolean> => {
      this.calls.push('schedules');
      return this.scheduleAnswers.shift() ?? false;
    },
  };

  readonly curations = {
    sweepStale: async (): Promise<void> => {
      this.calls.push('curation-sweep');
    },
    claimNext: async (): Promise<boolean> => {
      this.calls.push('curations');
      return false;
    },
  };

  readonly publish = {
    sweep: async (): Promise<void> => {
      this.calls.push('publish-sweep');
    },
    claimNext: async (): Promise<boolean> => this.step('publish', this.publishAnswers),
  };

  readonly metricsPoll = {
    run: async (): Promise<boolean> => this.step('poll', this.pollAnswers),
  };

  /** Asset jobs are a required collaborator (guided-creation design section 1); here they never find work. */
  readonly assetJobs = {
    sweepStale: async (): Promise<void> => undefined,
    claimNext: async (): Promise<boolean> => false,
  };

  loop(): DaemonLoop {
    return new DaemonLoop(this.engine, this.scanner, this.curations, this.schedules, this.busy, this.shutdown.signal, this.publish, this.metricsPoll, this.assetJobs);
  }

  private step(call: LoopCall, answers: boolean[]): boolean {
    this.calls.push(call);
    const worked = answers.shift() ?? false;
    this.clock.advance(worked ? WORK_MS : IDLE_MS);
    return worked;
  }
}

const IDLE_ROUND: readonly LoopCall[] = ['scan', 'publish', 'schedules', 'poll', 'curations'];

describe('DaemonLoop platform steps (SPEC 0007 section 5.5)', () => {
  before(() => {
    // The loop logs every scan outcome; the assertions read the fakes, not the console.
    Logger.overrideLogger(false);
  });

  it('sweeps publish/ once at start, after the curation sweep and before the first scan', async () => {
    const fakes = new PlatformLoopFakes([[], [], []]);
    fakes.publishAnswers.push(true, true);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls.slice(0, 3), ['curation-sweep', 'publish-sweep', 'scan']);
    assert.equal(fakes.calls.filter((call) => call === 'publish-sweep').length, 1);
  });

  it('runs publish, schedules, metrics poll, then curations on a scan that found no startable run', async () => {
    const fakes = new PlatformLoopFakes([[]]);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['curation-sweep', 'publish-sweep', ...IDLE_ROUND]);
  });

  it('scans runs/ again at once after a claimed upload, before schedules are evaluated', async () => {
    const fakes = new PlatformLoopFakes([[], []]);
    fakes.publishAnswers.push(true);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['curation-sweep', 'publish-sweep', 'scan', 'publish', ...IDLE_ROUND]);
  });

  it('polls only after a schedule evaluation that fired nothing', async () => {
    const fakes = new PlatformLoopFakes([[], []]);
    fakes.scheduleAnswers.push(true);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['curation-sweep', 'publish-sweep', 'scan', 'publish', 'schedules', ...IDLE_ROUND]);
  });

  it('scans runs/ again at once after a poll that called a platform, before curations', async () => {
    const fakes = new PlatformLoopFakes([[], []]);
    fakes.pollAnswers.push(true);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['curation-sweep', 'publish-sweep', 'scan', 'publish', 'schedules', 'poll', ...IDLE_ROUND]);
  });

  it('records an upload that ran and a poll that called as busy', async () => {
    const fakes = new PlatformLoopFakes([[], [], []]);
    fakes.publishAnswers.push(true);
    fakes.pollAnswers.push(true);

    await fakes.loop().run();

    // Upload: [start, start + 5 min]. Second round: publish idle 1 min, then the poll [+6 min, +11 min].
    assert.equal(fakes.busy.wasBusyAt(new Date(start + WORK_MS / 2)), true, 'the upload interval was recorded');
    assert.equal(fakes.busy.wasBusyAt(new Date(start + WORK_MS + IDLE_MS + WORK_MS / 2)), true, 'the poll interval was recorded');
  });

  it('does not record a publish that claimed nothing or a poll that called nothing', async () => {
    const fakes = new PlatformLoopFakes([[]]);

    await fakes.loop().run();

    // Publish took [start, +1 min], the poll [+1 min, +2 min]; both answered false.
    assert.equal(fakes.busy.wasBusyAt(new Date(start + IDLE_MS / 2)), false);
    assert.equal(fakes.busy.wasBusyAt(new Date(start + IDLE_MS + IDLE_MS / 2)), false);
  });

  it('claims no upload while a run is startable, and only after the run finished', async () => {
    const candidate: RunCandidate = { runId: RUN_ID, runDir: `/data-home/runs/${RUN_ID}`, trigger: 'pending' };
    const fakes = new PlatformLoopFakes([[candidate], []]);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['curation-sweep', 'publish-sweep', 'scan', 'execute', ...IDLE_ROUND]);
  });

  it('neither publishes nor polls after a failed runs/ scan', async () => {
    const fakes = new PlatformLoopFakes([new Error('EACCES: runs/ unreadable')]);

    await fakes.loop().run();

    assert.deepEqual(fakes.calls, ['curation-sweep', 'publish-sweep', 'scan']);
  });
});
