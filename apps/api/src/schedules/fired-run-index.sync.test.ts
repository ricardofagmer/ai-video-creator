import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { SyncRunIndexCommand } from '@studio/core/runs';
import { ScheduleFileCorruptError } from '@studio/core/schedules';
import { type JsonLinesPage } from '@studio/shared/run-files';
import { type ScheduleId, type SlotLine } from '@studio/shared/schedules';
import { FiredRunIndexSync, type RunIndexCommandPort } from './fired-run-index.sync';
import { SlotTailReader, type SlotLogSource } from './slot-tail.reader';

const SCHEDULE_A = '01JD00000000000000000000AA';
const SCHEDULE_B = '01JD00000000000000000000BB';
const RUN_1 = '01JD0000000000000000000R01';
const RUN_2 = '01JD0000000000000000000R02';
const RUN_OLD = '01JD0000000000000000000R00';
const BRIEF = '01JD0000000000000000000B01';

function firedLine(runId: string, decidedAt: Date = new Date()): SlotLine {
  return { slotAt: decidedAt.toISOString(), decidedAt: decidedAt.toISOString(), result: 'fired', reasonId: null, runId, briefId: BRIEF };
}

function skippedLine(): SlotLine {
  const now = new Date().toISOString();
  return { slotAt: now, decidedAt: now, result: 'skipped', reasonId: 'previous-run-open', runId: null, briefId: null };
}

/**
 * The watcher's `slots.jsonl` per schedule, in memory. Offsets count lines instead of bytes; the
 * reader only hands `nextByte` back, so the contract it relies on is the same. Pages hold two lines
 * so multi-page reads are exercised.
 */
class InMemorySlotLogs implements SlotLogSource {
  private readonly logs = new Map<ScheduleId, SlotLine[]>();
  readonly unreadable = new Set<ScheduleId>();

  append(scheduleId: ScheduleId, line: SlotLine): void {
    const lines = this.logs.get(scheduleId) ?? [];
    lines.push(line);
    this.logs.set(scheduleId, lines);
  }

  async listAll(): Promise<{ scheduleId: ScheduleId }[]> {
    return [...this.logs.keys()].sort().map((scheduleId) => ({ scheduleId }));
  }

  async readSlotLinesFrom(scheduleId: ScheduleId, fromByte: number): Promise<JsonLinesPage<SlotLine>> {
    if (this.unreadable.has(scheduleId)) throw new ScheduleFileCorruptError(scheduleId, 'slots.jsonl');
    const entries = (this.logs.get(scheduleId) ?? []).slice(fromByte, fromByte + 2);
    return { entries, nextByte: fromByte + entries.length, pendingTailBytes: 0 };
  }
}

/** The run index core's `SyncRunIndexCommand` handler keeps in SQLite, in memory. */
class InMemoryRunIndex implements RunIndexCommandPort {
  readonly indexed = new Set<string>();
  readonly dispatched: string[] = [];
  readonly failOnce = new Set<string>();

  async execute(command: SyncRunIndexCommand): Promise<unknown> {
    this.dispatched.push(command.runId);
    if (this.failOnce.delete(command.runId)) throw new Error('index busy');
    this.indexed.add(command.runId);
    return { runId: command.runId };
  }
}

describe('fired-run index sync (SPEC 0006 section 5.7, R3-AC-22)', () => {
  let slotLogs: InMemorySlotLogs;
  let runIndex: InMemoryRunIndex;
  let sync: FiredRunIndexSync;

  /** What `GET /runs` does (runs.controller.ts `list`): sync fired runs, then read the index. */
  async function getRuns(): Promise<string[]> {
    await sync.syncFiredRuns();
    return [...runIndex.indexed];
  }

  beforeEach(() => {
    slotLogs = new InMemorySlotLogs();
    runIndex = new InMemoryRunIndex();
    sync = new FiredRunIndexSync(new SlotTailReader(slotLogs), runIndex);
  });

  it('lists a fired run on the first request after its fired line is written, without a restart', async () => {
    slotLogs.append(SCHEDULE_A, skippedLine());
    assert.deepEqual(await getRuns(), []);

    slotLogs.append(SCHEDULE_A, firedLine(RUN_1));
    assert.deepEqual(await getRuns(), [RUN_1]);
    assert.deepEqual(runIndex.dispatched, [RUN_1]);
  });

  it('dispatches each fired run once: the offset moves past lines already read', async () => {
    slotLogs.append(SCHEDULE_A, firedLine(RUN_1));
    await getRuns();
    await getRuns();
    slotLogs.append(SCHEDULE_A, skippedLine());
    slotLogs.append(SCHEDULE_A, firedLine(RUN_2));
    await getRuns();
    assert.deepEqual(runIndex.dispatched, [RUN_1, RUN_2]);
  });

  it('ignores skipped and missed lines', async () => {
    slotLogs.append(SCHEDULE_A, skippedLine());
    slotLogs.append(SCHEDULE_A, skippedLine());
    slotLogs.append(SCHEDULE_A, skippedLine());
    assert.deepEqual(await getRuns(), []);
    assert.deepEqual(runIndex.dispatched, []);
  });

  it('leaves runs fired long before the api started to the start rebuild', async () => {
    slotLogs.append(SCHEDULE_A, firedLine(RUN_OLD, new Date(Date.now() - 60 * 60 * 1000)));
    slotLogs.append(SCHEDULE_A, firedLine(RUN_1));
    assert.deepEqual(await getRuns(), [RUN_1]);
    assert.deepEqual(runIndex.dispatched, [RUN_1]);
  });

  it('retries a failed sync on the next request', async () => {
    runIndex.failOnce.add(RUN_1);
    slotLogs.append(SCHEDULE_A, firedLine(RUN_1));
    assert.deepEqual(await getRuns(), []);
    assert.deepEqual(await getRuns(), [RUN_1]);
    assert.deepEqual(runIndex.dispatched, [RUN_1, RUN_1]);
  });

  it('never fails the request for an unreadable log, and still syncs the other schedules', async () => {
    slotLogs.append(SCHEDULE_A, firedLine(RUN_1));
    slotLogs.append(SCHEDULE_B, firedLine(RUN_2));
    slotLogs.unreadable.add(SCHEDULE_A);
    assert.deepEqual(await getRuns(), [RUN_2]);

    slotLogs.unreadable.delete(SCHEDULE_A);
    assert.deepEqual((await getRuns()).sort(), [RUN_1, RUN_2]);
  });

  it('serializes concurrent requests so a fired run is dispatched once', async () => {
    slotLogs.append(SCHEDULE_A, firedLine(RUN_1));
    await Promise.all([sync.syncFiredRuns(), sync.syncFiredRuns(), sync.syncFiredRuns()]);
    assert.deepEqual(runIndex.dispatched, [RUN_1]);
  });
});
