import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type Brief, type Recipe } from '@studio/shared/recipes';
import { newUlid } from '@studio/shared/run-files';
import { scheduleBounds, type ScheduleFile } from '@studio/shared/schedules';
import { listScheduleIds } from '@studio/shared/schedules/files';
import { DataHome } from '../../paths/data-home';
import { type RecipeVersionView } from '../../recipes/recipe-version.mapper';
import { ScheduleRecipeGate } from '../schedule-recipe.gate';
import { ScheduleStore } from '../schedule-store';
import { ScheduleViewAssembler } from '../schedule-view.assembler';
import { ScheduleWriter } from '../schedule-writer';
import { type CreateScheduleInput } from '../schedule.input';
import {
  ScheduleEstimateChangedError,
  ScheduleLimitReachedError,
  ScheduleRecipeNotRunnableError,
  ScheduleTimeInvalidError,
} from '../schedules.errors';
import { CreateScheduleCommand } from './create-schedule.command';
import { CreateScheduleHandler } from './create-schedule.handler';

/*
 * `POST /schedules` at handler level (SPEC 0006 section 5.5, R3-AC-18): the 10-schedule limit
 * counts every schedule not `deleted` and fails closed on an unreadable one, the consent equals the
 * recipe's resolved `costPerRunUsd` to the cent (default $3, `defaultLimits`), and the refusal order
 * is body, limit, recipe, consent, future slot. Everything runs against an `fs.mkdtemp` data home
 * with the real store, writer and assembler; only the recipe gate (Prisma reads) is a stub. No
 * SQLite, no real data home, no network.
 */

function recipe(limits: Recipe['limits'] = {}): Recipe {
  return {
    id: 'demo-recipe',
    version: 1,
    name: 'Demo recipe',
    description: '',
    status: 'active',
    owner: 'owner',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    provenance: null,
    notes: '',
    graph: { stages: [{ stageId: 'plan', enabled: true, checks: [], timeoutMs: null, params: {} }] },
    bindings: [],
    format: {
      canvas: { width: 1920, height: 1080 },
      aspect: '16:9',
      fps: 30,
      duration: { minSec: 30, maxSec: 90 },
      language: 'pt-BR',
      loudness: { integratedLufs: -14, truePeakDbtp: -1, toleranceLu: 1 },
      captions: { yPercent: 80, maxLines: 2 },
      narration: { maxWordsPerSecond: 3 },
      sceneCount: { min: 1, max: 10 },
    },
    gates: [],
    inputs: { required: [], keyMessages: { min: 0, max: 5 } },
    checks: [],
    limits,
    rubric: [],
    checklist: [],
    allowedKinds: ['template'],
  };
}

/** Step 3 stand-in: answers the configured version, or throws the configured refusal. */
class StubRecipeGate implements Pick<ScheduleRecipeGate, 'runnableVersion'> {
  calls = 0;
  refusal: Error | null = null;
  version: RecipeVersionView = { ref: 'demo-recipe@1', contentHash: 'a'.repeat(64), recipe: recipe() };

  async runnableVersion(): Promise<RecipeVersionView> {
    this.calls += 1;
    if (this.refusal !== null) throw this.refusal;
    return this.version;
  }
}

const brief: Brief = { topic: 'Weekly product tour', keyMessages: [], format: '16:9', language: 'pt-BR', targetDurationSec: 60 };

type CreateRequest = CreateScheduleInput['request'];

function createInput(overrides: Partial<CreateRequest> = {}): CreateScheduleInput {
  return {
    request: {
      title: 'Weekly tour',
      recipeRef: 'demo-recipe@1',
      recurrence: { kind: 'daily', time: '09:00' },
      timezone: 'America/Sao_Paulo',
      briefMode: 'queue',
      briefs: [{ brief, references: [] }],
      acceptedWorstCasePerRunUsd: 3,
      ...overrides,
    },
    createdBy: 'api',
    correlationId: null,
  };
}

/** A `once` slot long gone: the only recurrence with no future slot (step 5). */
const pastOnce: CreateRequest['recurrence'] = { kind: 'once', date: '2020-01-01', time: '09:00' };

function storedSchedule(status: ScheduleFile['status'], index: number): ScheduleFile {
  const at = '2026-11-01T00:00:00.000Z';
  return {
    format: 1,
    scheduleId: newUlid(Date.parse(at) + index),
    title: `Seeded ${index}`,
    status,
    statusSince: at,
    createdAt: at,
    updatedAt: at,
    createdBy: 'api',
    correlationId: null,
    recipeRef: 'demo-recipe@1',
    recurrence: { kind: 'daily', time: '09:00' },
    timezone: 'America/Sao_Paulo',
    briefMode: 'queue',
    briefs: [{ briefId: newUlid(Date.parse(at) + index), brief, references: [] }],
    costConsent: { perRunUsd: 3, acceptedAt: at },
  };
}

interface Harness {
  root: string;
  dataHome: DataHome;
  writer: ScheduleWriter;
  gate: StubRecipeGate;
  handler: CreateScheduleHandler;
}

let harness: Harness;

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'core-create-schedule-'));
  const dataHome = new DataHome(root);
  const writer = new ScheduleWriter(dataHome);
  const gate = new StubRecipeGate();
  const handler = new CreateScheduleHandler(new ScheduleStore(dataHome), writer, gate, new ScheduleViewAssembler());
  return { root, dataHome, writer, gate, handler };
}

/** Seeds schedules through the real writer; `deleted` ones are created `active`, then rewritten. */
async function seed(status: ScheduleFile['status'], count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const file = storedSchedule('active', index);
    await harness.writer.create(file);
    if (status !== 'active') await harness.writer.rewrite({ ...file, status });
  }
}

/** A schedule folder whose `schedule.json` is not JSON: the store lists it as `unreadable`. */
async function seedUnreadable(): Promise<void> {
  const folder = join(harness.dataHome.schedules, newUlid(Date.parse('2026-11-02T00:00:00.000Z')));
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'schedule.json'), '{not json', 'utf8');
}

async function scheduleCount(): Promise<number> {
  return (await listScheduleIds(harness.dataHome.schedules)).length;
}

function create(input: CreateScheduleInput = createInput()): ReturnType<CreateScheduleHandler['execute']> {
  return harness.handler.execute(new CreateScheduleCommand(input));
}

function isTimeInvalid(problem: ScheduleTimeInvalidError['problem']): (error: unknown) => boolean {
  return (error) => error instanceof ScheduleTimeInvalidError && error.problem === problem;
}

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  await rm(harness.root, { recursive: true, force: true });
});

describe('CreateScheduleHandler: writes an active schedule.json', () => {
  it('creates the folder with status active and the consent recorded as the resolved per-run ceiling', async () => {
    const view = await create();
    assert.equal(view.status, 'active');
    assert.equal(view.costConsent.perRunUsd, 3);
    const stored = await new ScheduleStore(harness.dataHome).read(view.scheduleId);
    assert.equal(stored?.status, 'active');
    assert.equal(stored?.recipeRef, 'demo-recipe@1');
    assert.equal(await scheduleCount(), 1);
  });
});

describe('CreateScheduleHandler: cost consent to the cent (step 4, R3-AC-18)', () => {
  it('accepts a consent equal to the default $3 ceiling at cent precision', async () => {
    const view = await create(createInput({ acceptedWorstCasePerRunUsd: 3.001 }));
    assert.equal(view.costConsent.perRunUsd, 3);
  });

  it('refuses a consent one cent under or over the ceiling with 409 schedule-estimate-changed and writes nothing', async () => {
    for (const acceptedWorstCasePerRunUsd of [2.99, 3.01, 0]) {
      await assert.rejects(create(createInput({ acceptedWorstCasePerRunUsd })), ScheduleEstimateChangedError, String(acceptedWorstCasePerRunUsd));
    }
    assert.equal(await scheduleCount(), 0);
  });

  it('compares against the recipe override, not the default', async () => {
    harness.gate.version = { ...harness.gate.version, recipe: recipe({ costPerRunUsd: 4.5 }) };
    await assert.rejects(create(createInput({ acceptedWorstCasePerRunUsd: 3 })), ScheduleEstimateChangedError);
    const view = await create(createInput({ acceptedWorstCasePerRunUsd: 4.5 }));
    assert.equal(view.costConsent.perRunUsd, 4.5);
  });
});

describe('CreateScheduleHandler: the 10-schedule limit (step 2, R3-AC-18)', () => {
  it('refuses an 11th schedule with 422 schedule-limit-reached before the recipe is read', async () => {
    await seed('active', scheduleBounds.maxSchedules);
    await assert.rejects(create(), (error: unknown) => error instanceof ScheduleLimitReachedError && error.existing === scheduleBounds.maxSchedules);
    assert.equal(harness.gate.calls, 0);
    assert.equal(await scheduleCount(), scheduleBounds.maxSchedules);
  });

  it('leaves deleted schedules out of the count', async () => {
    await seed('active', scheduleBounds.maxSchedules - 1);
    await seed('deleted', 3);
    await create();
    assert.equal(await scheduleCount(), scheduleBounds.maxSchedules - 1 + 3 + 1);
    await assert.rejects(create(), ScheduleLimitReachedError);
  });

  it('counts paused schedules', async () => {
    await seed('paused', scheduleBounds.maxSchedules);
    await assert.rejects(create(), ScheduleLimitReachedError);
  });

  it('fails closed: an unreadable schedule holds its place in the count', async () => {
    await seed('active', scheduleBounds.maxSchedules - 1);
    await seedUnreadable();
    await assert.rejects(create(), (error: unknown) => error instanceof ScheduleLimitReachedError && error.existing === scheduleBounds.maxSchedules);
    assert.equal(harness.gate.calls, 0);
  });
});

describe('CreateScheduleHandler: refusal order of SPEC 0006 section 5.5', () => {
  it('answers schedule-time-invalid for an unknown zone before the limit (step 1)', async () => {
    await seed('active', scheduleBounds.maxSchedules);
    await assert.rejects(create(createInput({ timezone: 'Mars/Olympus_Mons' })), isTimeInvalid('timezone'));
  });

  it('answers the limit before a past once slot (step 2 before step 5)', async () => {
    await seed('active', scheduleBounds.maxSchedules);
    await assert.rejects(create(createInput({ recurrence: pastOnce })), ScheduleLimitReachedError);
  });

  it('answers the recipe before a past once slot (step 3 before step 5)', async () => {
    harness.gate.refusal = new ScheduleRecipeNotRunnableError('demo-recipe@1', 'recipe-not-runnable');
    await assert.rejects(create(createInput({ recurrence: pastOnce, acceptedWorstCasePerRunUsd: 1 })), ScheduleRecipeNotRunnableError);
  });

  it('answers the consent before a past once slot (step 4 before step 5)', async () => {
    await assert.rejects(create(createInput({ recurrence: pastOnce, acceptedWorstCasePerRunUsd: 2.99 })), ScheduleEstimateChangedError);
  });

  it('refuses a once slot not in the future last, with schedule-time-invalid, and writes nothing', async () => {
    await assert.rejects(create(createInput({ recurrence: pastOnce })), isTimeInvalid('no-future-slot'));
    assert.equal(harness.gate.calls, 1);
    assert.equal(await scheduleCount(), 0);
  });
});
