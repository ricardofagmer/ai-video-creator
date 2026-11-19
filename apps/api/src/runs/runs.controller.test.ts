import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CountRunPublicationsQuery, type RunPublicationCounts } from '@studio/core/metrics';
import { DataHome } from '@studio/core/paths';
import { ListRunsQuery, SyncRunIndexCommand, type RunIndexEntry, type RunIndexPage } from '@studio/core/runs';
import { GetScheduleQuery, ListSchedulesQuery } from '@studio/core/schedules';
import { RunIndexPageSchema, type ScheduleListView, type ScheduleView } from '@studio/shared/api';
import { readRunFile, runDirectory, writeRunFile, type JsonLinesPage } from '@studio/shared/run-files';
import { RunFileSchema, type RunFile, type RunScheduleLink } from '@studio/shared/run-format';
import { type ScheduleId, type SlotLine } from '@studio/shared/schedules';
import { RequestContext } from '../platform/request-context';
import { FiredRunIndexSync, type RunIndexCommandPort } from '../schedules/fired-run-index.sync';
import { SchedulesController, type ScheduleCommandPort, type ScheduleQueryPort } from '../schedules/schedules.controller';
import { SlotTailReader, type SlotLogSource } from '../schedules/slot-tail.reader';
import { RunCursorReader } from './run-cursor.reader';
import { RunScheduleLinkReader } from './run-schedule-link.reader';
import { RunsController, type PublicationCountPort, type RunCommandPort, type RunListQueryPort } from './runs.controller';

/** A valid run.json shared with the watcher's tests; each case rewrites the identity fields. */
const FIXTURE_RUN = resolve(__dirname, '../../../watcher/fixtures/product-tour-16x9/run.json');

const SCHEDULE_A = '01JD00000000000000000000AA';
const BRIEF = '01JD0000000000000000000B01';
const RUN_FIRED = '01JD0000000000000000000R01';
const RUN_BY_CLI = '01JD0000000000000000000R02';
const RUN_WITHOUT_FILE = '01JD0000000000000000000R03';

function firedLine(runId: string, decidedAt: Date = new Date()): SlotLine {
  return { slotAt: decidedAt.toISOString(), decidedAt: decidedAt.toISOString(), result: 'fired', reasonId: null, runId, briefId: BRIEF };
}

function skippedLine(): SlotLine {
  const now = new Date().toISOString();
  return { slotAt: now, decidedAt: now, result: 'skipped', reasonId: 'previous-run-open', runId: null, briefId: null };
}

/** The watcher's `slots.jsonl` per schedule, in memory; offsets count lines (only `nextByte` is handed back). */
class InMemorySlotLogs implements SlotLogSource {
  private readonly logs = new Map<ScheduleId, SlotLine[]>();

  append(scheduleId: ScheduleId, line: SlotLine): void {
    const lines = this.logs.get(scheduleId) ?? [];
    lines.push(line);
    this.logs.set(scheduleId, lines);
  }

  async listAll(): Promise<{ scheduleId: ScheduleId }[]> {
    return [...this.logs.keys()].sort().map((scheduleId) => ({ scheduleId }));
  }

  async readSlotLinesFrom(scheduleId: ScheduleId, fromByte: number): Promise<JsonLinesPage<SlotLine>> {
    const entries = (this.logs.get(scheduleId) ?? []).slice(fromByte, fromByte + 2);
    return { entries, nextByte: fromByte + entries.length, pendingTailBytes: 0 };
  }
}

function entryOf(run: RunFile): RunIndexEntry {
  return {
    runId: run.runId,
    title: run.title,
    status: run.state.status,
    statusSince: run.state.since,
    createdBy: run.createdBy,
    recipe: { ref: run.recipe.ref, contentHash: run.recipe.contentHash },
    costUsd: run.totals.costUsd,
    durationMs: run.totals.durationMs,
    totals: run.totals,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    indexedAt: new Date().toISOString(),
  };
}

/**
 * The run index core keeps in SQLite, in memory: `SyncRunIndexCommand` mirrors the run folder's
 * run.json into a row (files win), as core's handler does, and `ListRunsQuery` reads the rows.
 */
class InMemoryRunIndex implements RunIndexCommandPort, RunListQueryPort {
  private readonly rows = new Map<string, RunIndexEntry>();
  readonly dispatched: string[] = [];

  constructor(private readonly dataHome: DataHome) {}

  put(entry: RunIndexEntry): void {
    this.rows.set(entry.runId, entry);
  }

  execute(command: SyncRunIndexCommand): Promise<RunIndexEntry>;
  execute(query: ListRunsQuery): Promise<RunIndexPage>;
  async execute(message: SyncRunIndexCommand | ListRunsQuery): Promise<RunIndexEntry | RunIndexPage> {
    if (message instanceof ListRunsQuery) {
      const items = [...this.rows.values()];
      return { items, total: items.length, nextCursor: null };
    }
    this.dispatched.push(message.runId);
    const entry = entryOf(await readRunFile(runDirectory(this.dataHome.runs, message.runId)));
    this.rows.set(entry.runId, entry);
    return entry;
  }
}

/** `run_publications` counts in memory; records each grouped query so a test can count them. */
class InMemoryPublicationCounts implements PublicationCountPort {
  readonly counts = new Map<string, number>();
  readonly queries: string[][] = [];

  async execute(query: CountRunPublicationsQuery): Promise<RunPublicationCounts> {
    this.queries.push([...query.runIds]);
    return Object.fromEntries(query.runIds.map((runId) => [runId, this.counts.get(runId) ?? 0]));
  }
}

const noRunCommands: RunCommandPort = { execute: () => Promise.reject(new Error('no run command is expected')) };
const notExpected = (): Promise<never> => Promise.reject(new Error('not expected on GET /runs'));

class EmptyScheduleQueries implements ScheduleQueryPort {
  execute(query: GetScheduleQuery): Promise<ScheduleView>;
  execute(query: ListSchedulesQuery): Promise<ScheduleListView>;
  async execute(query: GetScheduleQuery | ListSchedulesQuery): Promise<ScheduleView | ScheduleListView> {
    if (query instanceof GetScheduleQuery) throw new Error('no get query is expected');
    return [];
  }
}

const noScheduleCommands: ScheduleCommandPort = { execute: () => Promise.reject(new Error('no schedule command is expected')) };

interface Harness {
  root: string;
  dataHome: DataHome;
  slotLogs: InMemorySlotLogs;
  runIndex: InMemoryRunIndex;
  publicationCounts: InMemoryPublicationCounts;
  runs: RunsController;
  schedules: SchedulesController;
  fixture: RunFile;
}

/**
 * `GET /runs` and `GET /schedules` as Nest wires them: the real `FiredRunIndexSync`,
 * `SlotTailReader`, `RunCursorReader` and `RunScheduleLinkReader` over a temporary data home.
 * Only the slot-log file port and the command and query buses are fakes.
 */
async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'studio-api-runs-'));
  const dataHome = new DataHome(root);
  const slotLogs = new InMemorySlotLogs();
  const runIndex = new InMemoryRunIndex(dataHome);
  const firedRuns = new FiredRunIndexSync(new SlotTailReader(slotLogs), runIndex);
  const publicationCounts = new InMemoryPublicationCounts();
  const runs = new RunsController(
    noRunCommands,
    runIndex,
    new RequestContext(),
    { readState: notExpected, readEvents: notExpected },
    { open: notExpected },
    { observe: () => assert.fail('not expected on GET /runs') },
    new RunCursorReader(dataHome),
    { forArtifactRoute: notExpected },
    firedRuns,
    new RunScheduleLinkReader(dataHome),
    publicationCounts,
  );
  const schedules = new SchedulesController(noScheduleCommands, new EmptyScheduleQueries(), new RequestContext(), firedRuns);
  const fixture = RunFileSchema.parse(JSON.parse(await readFile(FIXTURE_RUN, 'utf8')));
  return { root, dataHome, slotLogs, runIndex, publicationCounts, runs, schedules, fixture };
}

function scheduleLink(): RunScheduleLink {
  return { scheduleId: SCHEDULE_A, slotAt: '2026-11-19T12:00:00.000Z', briefId: BRIEF };
}

/** The run.json the watcher writes before its `fired` line (SPEC 0006 section 4.6). */
function watcherRun(fixture: RunFile, runId: string): RunFile {
  return { ...fixture, runId, createdBy: 'watcher', correlationId: null, schedule: scheduleLink() };
}

async function writeRun(harness: Harness, run: RunFile): Promise<void> {
  const runDir = runDirectory(harness.dataHome.runs, run.runId);
  await mkdir(runDir, { recursive: true });
  await writeRunFile(runDir, run);
}

describe('GET /runs lists schedule-fired runs (SPEC 0006 sections 4.4, 5.7, R3-AC-22)', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await rm(harness.root, { recursive: true, force: true });
  });

  it('lists a fired run on the first GET /runs after its fired line is written, without a restart', async () => {
    await writeRun(harness, watcherRun(harness.fixture, RUN_FIRED));
    harness.slotLogs.append(SCHEDULE_A, skippedLine());
    assert.deepEqual((await harness.runs.list({})).items, []);

    harness.slotLogs.append(SCHEDULE_A, firedLine(RUN_FIRED));
    const page = RunIndexPageSchema.parse(await harness.runs.list({}));
    assert.deepEqual(page.items.map((item) => item.runId), [RUN_FIRED]);
    assert.equal(page.total, 1);
    assert.deepEqual(harness.runIndex.dispatched, [RUN_FIRED]);
  });

  it('carries the run.json schedule link on a watcher-created row and the A22 cursor rule', async () => {
    await writeRun(harness, watcherRun(harness.fixture, RUN_FIRED));
    harness.slotLogs.append(SCHEDULE_A, firedLine(RUN_FIRED));
    const [row] = RunIndexPageSchema.parse(await harness.runs.list({})).items;
    assert.ok(row !== undefined);
    assert.equal(row.createdBy, 'watcher');
    assert.deepEqual(row.schedule, scheduleLink());
    // `pending` has no current now.json (A22).
    assert.equal(row.cursor, null);
  });

  it('indexes a fired run seen by GET /schedules, so the next GET /runs lists it without dispatching it again', async () => {
    await writeRun(harness, watcherRun(harness.fixture, RUN_FIRED));
    harness.slotLogs.append(SCHEDULE_A, firedLine(RUN_FIRED));
    assert.deepEqual(await harness.schedules.list(), []);
    assert.deepEqual(harness.runIndex.dispatched, [RUN_FIRED]);

    const page = await harness.runs.list({});
    assert.deepEqual(page.items.map((item) => item.runId), [RUN_FIRED]);
    assert.deepEqual(harness.runIndex.dispatched, [RUN_FIRED]);
  });

  it('omits the schedule key for a run not created by the watcher and for an unreadable run.json', async () => {
    const byCli = { ...harness.fixture, runId: RUN_BY_CLI };
    await writeRun(harness, byCli);
    harness.runIndex.put(entryOf(byCli));
    // Indexed as watcher-created, but its run folder is gone: display data missing, not a failure.
    harness.runIndex.put({ ...entryOf(byCli), runId: RUN_WITHOUT_FILE, createdBy: 'watcher' });

    const page = RunIndexPageSchema.parse(await harness.runs.list({}));
    assert.deepEqual(page.items.map((item) => item.runId).sort(), [RUN_BY_CLI, RUN_WITHOUT_FILE]);
    for (const item of page.items) assert.equal('schedule' in item, false);
  });

  it('fills publicationCount on every row from one grouped query per page, 0 when none is recorded', async () => {
    const byCli = { ...harness.fixture, runId: RUN_BY_CLI };
    await writeRun(harness, byCli);
    harness.runIndex.put(entryOf(byCli));
    await writeRun(harness, watcherRun(harness.fixture, RUN_FIRED));
    harness.slotLogs.append(SCHEDULE_A, firedLine(RUN_FIRED));
    harness.publicationCounts.counts.set(RUN_BY_CLI, 3);

    const page = RunIndexPageSchema.parse(await harness.runs.list({}));
    const countOf = new Map(page.items.map((item) => [item.runId, item.publicationCount]));
    assert.deepEqual(Object.fromEntries(countOf), { [RUN_BY_CLI]: 3, [RUN_FIRED]: 0 });
    assert.equal(harness.publicationCounts.queries.length, 1);
    assert.deepEqual([...(harness.publicationCounts.queries[0] ?? [])].sort(), [RUN_BY_CLI, RUN_FIRED].sort());
  });

  it('asks for no count beyond the page it lists', async () => {
    assert.deepEqual((await harness.runs.list({})).items, []);
    assert.deepEqual(harness.publicationCounts.queries, [[]]);
  });
});
