import 'reflect-metadata';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { readRunFile } from '@studio/shared/run-files';
import { type RecoveryRecord, type RunFile, type StageId, type StageRecord, type StepName, type StepRecord } from '@studio/shared/run-format';
import { startMockEngine, type MockEngineHandle } from '../../test-support';
import { RunBudget, captureBaseline, emptyBaseline } from '../run-budget';

/*
 * Ticket 02 (CR2) budget behaviour behind PRD 7.3: `limits.attemptsPerStep` and
 * `limits.recoveriesPerStage` count only what the current execution spent. An owner resume takes a
 * baseline so earlier attempts and Recovery calls stay in run.json for the audit trail without
 * counting again; with no baseline everything counts. The unit cases use a clone of the committed
 * fixture run; the engine cases run the mock engine with the `step-failure` fault.
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');
const SCRIPT: StageId = 'script';
const RESUME_AT = Date.parse('2026-11-21T12:00:00.000Z');
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

function recovery(number: number): RecoveryRecord {
  return {
    number,
    sessionId: null,
    attempt: number,
    error: `Falha simulada ${number}.`,
    cause: 'falha simulada',
    whatWasDone: 'repetir o passo',
    actionKind: 'retry-step',
    resolved: false,
    needsPerson: false,
    costUsd: 0,
    at: '2026-11-21T12:00:00.000Z',
  };
}

function stageOf(run: RunFile, stageId: StageId): StageRecord {
  const stage = run.stages.find((candidate) => candidate.stageId === stageId);
  if (stage === undefined) throw new Error(`the fixture run has no ${stageId} stage`);
  return stage;
}

function stepRecord(run: RunFile, stageId: StageId, step: StepName): StepRecord {
  const record = stageOf(run, stageId).steps.find((candidate) => candidate.step === step);
  if (record === undefined) throw new Error(`the fixture run has no ${stageId} ${step} step`);
  return record;
}

/** A clone of the fixture with the script `execute` step at `attempts`, carrying `recoveries` Recovery records. */
function runWithScriptExecute(fixture: RunFile, options: { attempts: number; recoveries: number }): RunFile {
  const run = structuredClone(fixture);
  const execute = stepRecord(run, SCRIPT, 'execute');
  execute.attempts = options.attempts;
  execute.recoveries = Array.from({ length: options.recoveries }, (_unused, index) => recovery(index + 1));
  return run;
}

describe('RunBudget (ticket 02, PRD 7.3 limits)', () => {
  let handle: MockEngineHandle | undefined;
  let fixture: RunFile;
  let scriptStageNumber: number;

  beforeEach(async () => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
    fixture = await readRunFile(FIXTURE_DIR);
    scriptStageNumber = stageOf(fixture, SCRIPT).number;
  });

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
    mock.restoreAll();
  });

  it('counts every recorded attempt when the execution took no baseline', () => {
    const run = runWithScriptExecute(fixture, { attempts: 3, recoveries: 0 });

    const used = new RunBudget(emptyBaseline).attemptsUsed(scriptStageNumber, stepRecord(run, SCRIPT, 'execute'));

    assert.equal(used, 3);
  });

  it('counts only the attempts made after the baseline an owner resume captured', () => {
    const atResume = runWithScriptExecute(fixture, { attempts: 2, recoveries: 0 });
    const budget = new RunBudget(captureBaseline(atResume));
    const later = runWithScriptExecute(fixture, { attempts: 3, recoveries: 0 });

    assert.equal(budget.attemptsUsed(scriptStageNumber, stepRecord(later, SCRIPT, 'execute')), 1);
  });

  it('never reports a negative attempt count when a step has fewer attempts than its baseline', () => {
    const budget = new RunBudget(captureBaseline(runWithScriptExecute(fixture, { attempts: 3, recoveries: 0 })));
    const reopened = runWithScriptExecute(fixture, { attempts: 1, recoveries: 0 });

    assert.equal(budget.attemptsUsed(scriptStageNumber, stepRecord(reopened, SCRIPT, 'execute')), 0);
  });

  it('returns only the Recovery calls recorded after the baseline', () => {
    const budget = new RunBudget(captureBaseline(runWithScriptExecute(fixture, { attempts: 2, recoveries: 1 })));
    const later = runWithScriptExecute(fixture, { attempts: 4, recoveries: 3 });

    const since = budget.recoveriesSince(scriptStageNumber, stepRecord(later, SCRIPT, 'execute'));

    assert.deepEqual(
      since.map((record) => record.number),
      [2, 3],
    );
  });

  it('sums the new Recovery calls of every step of a stage against limits.recoveriesPerStage', () => {
    const budget = new RunBudget(captureBaseline(runWithScriptExecute(fixture, { attempts: 2, recoveries: 1 })));
    const later = runWithScriptExecute(fixture, { attempts: 4, recoveries: 3 });
    stepRecord(later, SCRIPT, 'verify').recoveries = [recovery(1)];

    assert.equal(budget.stageRecoveriesUsed(stageOf(later, SCRIPT)), 3);
  });

  it('fails the run once limits.attemptsPerStep is spent, without a Recovery call', async () => {
    handle = await startMockEngine({ fault: 'step-failure', run: { limits: { ...fixture.limits, attemptsPerStep: 1 } } });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    const execute = stepRecord(run, SCRIPT, 'execute');
    assert.equal(result.status, 'failed');
    assert.equal(execute.attempts, 1);
    assert.equal(execute.recoveries.length, 0);
  });

  it('gives an owner-resumed failed run a fresh budget instead of failing before the step runs again', async () => {
    handle = await startMockEngine({ fault: 'step-failure' });
    await handle.execute();
    const first = stepRecord(await readRunFile(handle.runDir), SCRIPT, 'execute');
    await handle.writeControl({ pause: false, stop: false, resume: true, at: RESUME_AT });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    const execute = stepRecord(run, SCRIPT, 'execute');
    assert.equal(result.status, 'failed');
    assert.ok(execute.attempts > first.attempts, 'the resumed run did not run the failed step again');
    assert.ok(execute.recoveries.length > first.recoveries.length, 'the resumed run got no Recovery call of its own');
    assert.ok(execute.attempts - first.attempts <= run.limits.attemptsPerStep, 'the resumed run spent more than limits.attemptsPerStep');
    assert.ok(
      execute.recoveries.slice(0, first.recoveries.length).every((record, index) => record.number === first.recoveries[index]?.number),
      'earlier Recovery records were not kept for the audit trail',
    );
  });
});
