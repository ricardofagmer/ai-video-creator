import 'reflect-metadata';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DataHome } from '@studio/core/paths';
import {
  ScheduleRunsReader,
  ScheduleStore,
  ScheduledRunFactory,
  type SlotFactsRequest,
  type SlotGuardFacts,
  type StoredSchedule,
} from '@studio/core/schedules';
import { newUlid, readRunFile, runDirectory } from '@studio/shared/run-files';
import { RunFileSchema, type RunFile } from '@studio/shared/run-format';
import { type ScheduleCursor, type ScheduleFile, type SlotLine } from '@studio/shared/schedules';
import { readScheduleCursor, readSlotLines } from '@studio/shared/schedules/files';
import { type Clock } from '../engine/clock';
import { BusyIntervalTracker } from './busy-interval.tracker';
import { CandidateSlotFirer } from './candidate-slot.firer';
import { ScheduleEventRecorder, type ScheduleEvent } from './schedule-event.recorder';
import { ScheduleScanner } from './schedule-scanner';
import { ScheduleStep } from './schedule-step';
import { ScheduledRunFiles } from './scheduled-run.files';
import { SlotLogWriter } from './slot-log.writer';

/*
 * Test support for the schedule step tests (no test cases of its own). Everything runs against an
 * `fs.mkdtemp` data home under the OS temp folder with an injected clock: no SQLite, no real data
 * home, no network. The schedule list and the guard facts are in-memory fakes; slot lines, the
 * cursor, run folders and the crash lookup (`ScheduleRunsReader.findRunForSlot`) are the real code.
 */

const FIXTURE_RUN = resolve(__dirname, '../../fixtures/product-tour-16x9/run.json');

export const hourMs = 3_600_000;

/** Shown in no event or log line (K7): the tests assert it never appears. */
export const SCHEDULE_TITLE = 'Agendamento secreto de teste';

export class FakeClock implements Clock {
  private nowMs: number;

  constructor(start: string) {
    this.nowMs = Date.parse(start);
  }

  now(): Date {
    return new Date(this.nowMs);
  }

  set(instant: string): void {
    this.nowMs = Date.parse(instant);
  }
}

/** The real store's cursor reads over the temp data home; the schedule list is held in memory. */
export class InMemoryScheduleStore extends ScheduleStore {
  private readonly stored = new Map<string, StoredSchedule>();

  put(entry: StoredSchedule): void {
    this.stored.set(entry.scheduleId, entry);
  }

  override async listAll(): Promise<StoredSchedule[]> {
    return [...this.stored.values()].sort((left, right) => left.scheduleId.localeCompare(right.scheduleId));
  }
}

export class FakeSlotFacts {
  readonly requests: SlotFactsRequest[] = [];
  failure: Error | null = null;

  constructor(public facts: SlotGuardFacts) {}

  async collect(request: SlotFactsRequest): Promise<SlotGuardFacts> {
    this.requests.push(request);
    if (this.failure !== null) throw this.failure;
    return this.facts;
  }
}

export class CapturingEventRecorder extends ScheduleEventRecorder {
  readonly events: ScheduleEvent[] = [];

  override record(event: ScheduleEvent): void {
    this.events.push(event);
  }
}

export class SimulatedCrashError extends Error {
  constructor() {
    super('simulated crash between the run write and the slot line');
    this.name = 'SimulatedCrashError';
  }
}

/** Real appends, except that it can fail the next `fired` line once (a crash after the run write). */
export class CrashableSlotLogWriter extends SlotLogWriter {
  failNextFired = false;

  override async append(scheduleId: string, line: SlotLine): Promise<void> {
    if (line.result === 'fired' && this.failNextFired) {
      this.failNextFired = false;
      throw new SimulatedCrashError();
    }
    await super.append(scheduleId, line);
  }
}

export interface ScheduleHarness {
  root: string;
  dataHome: DataHome;
  clock: FakeClock;
  store: InMemoryScheduleStore;
  facts: FakeSlotFacts;
  events: CapturingEventRecorder;
  busy: BusyIntervalTracker;
  slotLog: CrashableSlotLogWriter;
  runFiles: ScheduledRunFiles;
  step: ScheduleStep;
  fixtureRun: RunFile;
}

async function loadFixtureRun(): Promise<RunFile> {
  return RunFileSchema.parse(JSON.parse(await readFile(FIXTURE_RUN, 'utf8')));
}

/** Facts under which every guard passes: no open run, no backlog, a brief, a known month figure. */
export function passingFacts(schedule: ScheduleFile, fixtureRun: RunFile): SlotGuardFacts {
  const { recipe } = fixtureRun;
  return {
    lastFiredRun: { state: 'none' },
    runsAtReview: 0,
    brief: schedule.briefs[0] ?? null,
    monthToDateUsd: 0,
    recipe: { state: 'found', version: { ref: recipe.ref, contentHash: recipe.contentHash, recipe: recipe.definition }, refsResolvable: true },
  };
}

/** A daily 09:00 schedule in America/Sao_Paulo (UTC-3, no DST): every slot is 12:00Z. */
export function dailySchedule(fixtureRun: RunFile, statusSince: string): ScheduleFile {
  return {
    format: 1,
    scheduleId: newUlid(Date.parse('2026-11-01T00:00:00.000Z')),
    title: SCHEDULE_TITLE,
    status: 'active',
    statusSince,
    createdAt: statusSince,
    updatedAt: statusSince,
    createdBy: 'api',
    correlationId: null,
    recipeRef: fixtureRun.recipe.ref,
    recurrence: { kind: 'daily', time: '09:00' },
    timezone: 'America/Sao_Paulo',
    briefMode: 'queue',
    briefs: [{ briefId: newUlid(Date.parse('2026-11-01T00:00:01.000Z')), brief: fixtureRun.brief, references: [] }],
    costConsent: { perRunUsd: 3, acceptedAt: statusSince },
  };
}

export async function createHarness(start: string): Promise<ScheduleHarness> {
  const root = await mkdtemp(join(tmpdir(), 'watcher-schedule-step-'));
  const dataHome = new DataHome(root);
  await mkdir(dataHome.runs, { recursive: true });
  await mkdir(dataHome.schedules, { recursive: true });
  const fixtureRun = await loadFixtureRun();
  const clock = new FakeClock(start);
  const store = new InMemoryScheduleStore(dataHome);
  const events = new CapturingEventRecorder();
  const busy = new BusyIntervalTracker(clock);
  const slotLog = new CrashableSlotLogWriter(dataHome, events);
  const runFiles = new ScheduledRunFiles(dataHome);
  const facts = new FakeSlotFacts(passingFacts(dailySchedule(fixtureRun, start), fixtureRun));
  const firer = new CandidateSlotFirer(new ScheduleRunsReader(dataHome), facts, new ScheduledRunFactory(), runFiles, slotLog, events);
  const step = new ScheduleStep(new ScheduleScanner(store), firer, slotLog, busy, events, clock);
  return { root, dataHome, clock, store, facts, events, busy, slotLog, runFiles, step, fixtureRun };
}

/**
 * A new step over the same data home, store, facts, events and clock, as a restarted process
 * would build it: fresh busy record, no in-memory slot or failure state, appends that never fail.
 */
export function restartStep(harness: ScheduleHarness): ScheduleStep {
  const busy = new BusyIntervalTracker(harness.clock);
  const slotLog = new SlotLogWriter(harness.dataHome, harness.events);
  const runFiles = new ScheduledRunFiles(harness.dataHome);
  const firer = new CandidateSlotFirer(new ScheduleRunsReader(harness.dataHome), harness.facts, new ScheduledRunFactory(), runFiles, slotLog, harness.events);
  return new ScheduleStep(new ScheduleScanner(harness.store), firer, slotLog, busy, harness.events, harness.clock);
}

/** Adds an `active` daily schedule and points the guard facts at its first brief. */
export function addDailySchedule(harness: ScheduleHarness, statusSince: string): ScheduleFile {
  const schedule = dailySchedule(harness.fixtureRun, statusSince);
  harness.store.put({ scheduleId: schedule.scheduleId, state: 'readable', file: schedule });
  harness.facts.facts = passingFacts(schedule, harness.fixtureRun);
  return schedule;
}

export async function removeHarness(harness: ScheduleHarness): Promise<void> {
  await rm(harness.root, { recursive: true, force: true });
}

export async function slotLines(harness: ScheduleHarness, scheduleId: string): Promise<SlotLine[]> {
  return (await readSlotLines({ schedulesRoot: harness.dataHome.schedules, scheduleId })).entries;
}

export async function cursorOf(harness: ScheduleHarness, scheduleId: string): Promise<ScheduleCursor | null> {
  const state = await readScheduleCursor({ schedulesRoot: harness.dataHome.schedules, scheduleId });
  return state.status === 'present' ? state.value : null;
}

export async function runFolderIds(harness: ScheduleHarness): Promise<string[]> {
  return (await readdir(harness.dataHome.runs)).sort();
}

export async function readRun(harness: ScheduleHarness, runId: string): Promise<RunFile> {
  return readRunFile(runDirectory(harness.dataHome.runs, runId));
}

export async function runFolderEntries(harness: ScheduleHarness, runId: string): Promise<string[]> {
  return (await readdir(runDirectory(harness.dataHome.runs, runId))).sort();
}
