import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Module, type InjectionToken, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CostLedgerService } from '@studio/core/costs';
import { ScheduleRunsReader, ScheduleStore, ScheduledRunFactory, SlotFactsCollector, type SlotGuardFacts } from '@studio/core/schedules';
import { type ScheduleFile } from '@studio/shared/schedules';
import { CandidateSlotFirer } from './candidate-slot.firer';
import { ScheduleScanner } from './schedule-scanner';
import { ScheduleStep } from './schedule-step';
import { ScheduledRunFiles } from './scheduled-run.files';
import { SlotLogWriter } from './slot-log.writer';
import {
  addDailySchedule,
  createHarness,
  passingFacts,
  removeHarness,
  runFolderIds,
  slotLines,
  type ScheduleHarness,
} from './schedule-step.harness.test';

/*
 * R3-AC-17 and K11 through the real core `SlotFactsCollector` (SPEC 0006 section 5.6 "guards",
 * D11): the month-to-date read fails closed. A spend source that throws, with an `Error` or with
 * anything else, makes the figure null (never zero), logs the error class name only, and the slot
 * is `skipped` / `month-spend-unavailable` with no run written; a non-finite or negative figure is
 * unknown too. The collector is resolved by Nest DI so that only its two database-backed readers
 * (the recipe reader and the cost ledger) are in-memory fakes: the slot log, the fired-run reads,
 * the brief selection and the guard chain are the real code over the `fs.mkdtemp` data home. No
 * SQLite and no network.
 */

const DUE_AT = '2026-11-20T12:30:00.000Z';
const SPEND_SOURCE_DETAIL = 'ledger detail that must not be logged';

type SpendSource = (at: Date) => Promise<number>;

class CapturingLogger implements LoggerService {
  readonly warnings: unknown[] = [];

  log(): void {}

  error(): void {}

  warn(message: unknown): void {
    this.warnings.push(message);
  }
}

@Module({})
class SlotFactsTestModule {}

/**
 * The collector's constructor tokens, from its emitted design metadata. The recipe reader is not
 * exported by `@studio/core/schedules`, so its token is the one parameter that is none of the three
 * exported classes, checked by name.
 */
function recipeReaderToken(): InjectionToken {
  const paramTypes: unknown = Reflect.getMetadata('design:paramtypes', SlotFactsCollector);
  assert.ok(Array.isArray(paramTypes), 'SlotFactsCollector carries its constructor metadata');
  const known: unknown[] = [ScheduleStore, ScheduleRunsReader, CostLedgerService];
  const remaining: unknown[] = paramTypes.filter((paramType: unknown) => !known.includes(paramType));
  const [token, ...others] = remaining;
  assert.equal(others.length, 0);
  assert.ok(typeof token === 'function' && token.name === 'ScheduleRecipeReader');
  return token;
}

interface CollectorFixture {
  collector: SlotFactsCollector;
  logger: CapturingLogger;
  close: () => Promise<void>;
}

async function realCollector(harness: ScheduleHarness, schedule: ScheduleFile, spend: SpendSource): Promise<CollectorFixture> {
  const facts = passingFacts(schedule, harness.fixtureRun);
  assert.ok(facts.recipe.state === 'found');
  // The committed fixture recipe binds no voice, which the composition rules refuse for an enabled
  // `narration` stage; with one bound, the month spend is the only guard these tests exercise.
  const voice = { slot: 'voice', ref: 'narrator-voice@1', contentHash: 'c'.repeat(64) };
  const version = { ...facts.recipe.version, recipe: { ...facts.recipe.version.recipe, bindings: [...facts.recipe.version.recipe.bindings, voice] } };
  const logger = new CapturingLogger();
  const app = await NestFactory.createApplicationContext(
    {
      module: SlotFactsTestModule,
      providers: [
        { provide: ScheduleStore, useValue: harness.store },
        { provide: ScheduleRunsReader, useValue: new ScheduleRunsReader(harness.dataHome) },
        { provide: recipeReaderToken(), useValue: { findVersion: async () => version, unresolved: async () => ({ bindings: [], references: [] }), templateDetails: async () => null } },
        { provide: CostLedgerService, useValue: { monthToDateUsd: spend } },
        SlotFactsCollector,
      ],
    },
    // abortOnError false: a resolution failure fails this test instead of exiting the process.
    { logger, abortOnError: false },
  );
  return { collector: app.get(SlotFactsCollector), logger, close: () => app.close() };
}

/** The production step around the real collector, over the harness data home and clock. */
function stepWith(harness: ScheduleHarness, collector: SlotFactsCollector): ScheduleStep {
  const slotLog = new SlotLogWriter(harness.dataHome, harness.events);
  const firer = new CandidateSlotFirer(
    new ScheduleRunsReader(harness.dataHome),
    collector,
    new ScheduledRunFactory(),
    new ScheduledRunFiles(harness.dataHome),
    slotLog,
    harness.events,
  );
  return new ScheduleStep(new ScheduleScanner(harness.store), firer, slotLog, harness.busy, harness.events, harness.clock);
}

describe('SlotFactsCollector: an unavailable month spend fails closed (R3-AC-17, K11)', () => {
  let harness: ScheduleHarness;
  let fixture: CollectorFixture | null = null;

  beforeEach(async () => {
    harness = await createHarness(DUE_AT);
  });

  afterEach(async () => {
    await fixture?.close();
    fixture = null;
    await removeHarness(harness);
  });

  const throwingSources: ReadonlyArray<{ name: string; spend: SpendSource; errorName: string }> = [
    {
      name: 'throws an Error',
      spend: async () => {
        throw new Error(SPEND_SOURCE_DETAIL);
      },
      errorName: 'Error',
    },
    {
      name: 'rejects with something that is not an Error',
      spend: () => Promise.reject(SPEND_SOURCE_DETAIL),
      errorName: 'unknown',
    },
  ];

  for (const source of throwingSources) {
    it(`answers null, never zero, and logs the class name only when the spend source ${source.name}`, async () => {
      const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
      fixture = await realCollector(harness, schedule, source.spend);

      const facts: SlotGuardFacts = await fixture.collector.collect({ schedule, now: harness.clock.now() });

      assert.equal(facts.monthToDateUsd, null);
      assert.deepEqual(fixture.logger.warnings, [{ event: 'schedule.month-spend-unavailable', scheduleId: schedule.scheduleId, errorName: source.errorName }]);
      assert.equal(JSON.stringify(fixture.logger.warnings).includes(SPEND_SOURCE_DETAIL), false);
    });

    it(`skips the slot with month-spend-unavailable and writes no run when the spend source ${source.name}`, async () => {
      const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
      fixture = await realCollector(harness, schedule, source.spend);

      assert.equal(await stepWith(harness, fixture.collector).evaluate(), false);

      assert.deepEqual(
        (await slotLines(harness, schedule.scheduleId)).map((line) => [line.slotAt, line.result, line.reasonId, line.runId]),
        [['2026-11-20T12:00:00.000Z', 'skipped', 'month-spend-unavailable', null]],
      );
      assert.deepEqual(await runFolderIds(harness), []);
    });
  }

  for (const figure of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    it(`skips the slot with month-spend-unavailable when the spend source answers ${figure}`, async () => {
      const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
      fixture = await realCollector(harness, schedule, async () => figure);

      assert.equal(await stepWith(harness, fixture.collector).evaluate(), false);

      assert.deepEqual(
        (await slotLines(harness, schedule.scheduleId)).map((line) => [line.result, line.reasonId]),
        [['skipped', 'month-spend-unavailable']],
      );
      assert.deepEqual(await runFolderIds(harness), []);
    });
  }

  it('fires with a known month figure, so the skips above come from the month spend alone', async () => {
    const schedule = addDailySchedule(harness, '2026-11-20T10:00:00.000Z');
    const asked: Date[] = [];
    fixture = await realCollector(harness, schedule, async (at) => {
      asked.push(at);
      return 0;
    });

    assert.equal(await stepWith(harness, fixture.collector).evaluate(), true);

    assert.deepEqual(
      (await slotLines(harness, schedule.scheduleId)).map((line) => line.result),
      ['fired'],
    );
    assert.equal((await runFolderIds(harness)).length, 1);
    assert.deepEqual(asked, [new Date(DUE_AT)], 'the month figure is read for the evaluation instant');
    assert.deepEqual(fixture.logger.warnings, []);
  });
});
