import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { readRunEvents, readRunFile } from '@studio/shared/run-files';
import { parseStepKey, type RunFile, type StageId, type StepName, type StepRecord, type StepStatus } from '@studio/shared/run-format';
import { startMockEngine, type MockEngineHandle } from '../../test-support';

/*
 * Ticket 02 acceptance criterion 3 (CR2, PRD criterion 15): every mock fault switch reaches its
 * documented end state. `verify-check-failure` fails one check on the first `verify` attempt and
 * recovers through the verify repeat to `review`; `step-failure` spends its attempts and Recovery
 * call and ends `failed`; `authentication-error` is never retried and waits for the owner;
 * `missing-output` fails the `execute` postcondition until the run fails. Faults hit the `script`
 * stage unless the switch names another stage (`<scenario>@<stageId>`).
 */

const SCRIPT: StageId = 'script';
const finishedStatuses: ReadonlySet<StepStatus> = new Set<StepStatus>(['ok', 'warning']);
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

function stepRecord(run: RunFile, stageId: StageId, step: StepName): StepRecord {
  const record = run.stages.find((stage) => stage.stageId === stageId)?.steps.find((candidate) => candidate.step === step);
  if (record === undefined) throw new Error(`the fixture run has no ${stageId} ${step} step`);
  return record;
}

function stageNumberOf(run: RunFile, stageId: StageId): number {
  const stage = run.stages.find((candidate) => candidate.stageId === stageId);
  if (stage === undefined) throw new Error(`the fixture run has no ${stageId} stage`);
  return stage.number;
}

/** Stages after `stageId` that the run touched at all: an outcome or a step that is not pending. */
function touchedStagesAfter(run: RunFile, stageId: StageId): StageId[] {
  const after = stageNumberOf(run, stageId);
  return run.stages
    .filter((stage) => stage.number > after)
    .filter((stage) => stage.outcome.status !== 'pending' || stage.steps.some((record) => record.status !== 'pending'))
    .map((stage) => stage.stageId);
}

function recoveriesInStage(run: RunFile, stageId: StageId): number {
  const stage = run.stages.find((candidate) => candidate.stageId === stageId);
  return stage === undefined ? 0 : stage.steps.reduce((total, record) => total + record.recoveries.length, 0);
}

async function recoveryEventCount(runDir: string): Promise<number> {
  return (await readRunEvents(runDir)).entries.filter((event) => event.type === 'step.recovery').length;
}

describe('mock fault switches (ticket 02 criterion 3, PRD criterion 15)', () => {
  let handle: MockEngineHandle | undefined;

  beforeEach(() => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
  });

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
    mock.restoreAll();
  });

  it('recovers from verify-check-failure through the verify repeat and reaches review', async () => {
    handle = await startMockEngine({ fault: 'verify-check-failure' });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    const verify = stepRecord(run, SCRIPT, 'verify');
    assert.equal(result.status, 'review');
    assert.equal(run.state.status, 'review');
    assert.equal(verify.attempts, 2, 'the failed verify was not repeated exactly once');
    assert.ok(finishedStatuses.has(verify.status), `the repeated verify ended ${verify.status}`);
    assert.equal(verify.recoveries.length, 0, 'the verify repeat called Recovery');
  });

  it('ends the run failed on step-failure after the attempts and Recovery the limits allow', async () => {
    handle = await startMockEngine({ fault: 'step-failure' });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    const execute = stepRecord(run, SCRIPT, 'execute');
    assert.equal(result.status, 'failed');
    assert.equal(run.state.status, 'failed');
    if (run.state.status !== 'failed') return;
    assert.ok(run.state.reason.trim().length > 0, 'the failed run has no owner reason');
    assert.notEqual(run.state.stepKey, null, 'the failed run names no step');
    if (run.state.stepKey !== null) {
      const failedAt = parseStepKey(run.state.stepKey);
      assert.deepEqual([failedAt.stageId, failedAt.step], [SCRIPT, 'execute']);
    }
    assert.equal(execute.status, 'failed');
    assert.ok(execute.attempts >= 1 && execute.attempts <= run.limits.attemptsPerStep, `execute ran ${execute.attempts} attempts`);
    assert.ok(recoveriesInStage(run, SCRIPT) <= run.limits.recoveriesPerStage, 'Recovery ran past limits.recoveriesPerStage');
    assert.equal(await recoveryEventCount(handle.runDir), execute.recoveries.length, 'a Recovery call was not recorded as a step.recovery event');
    assert.deepEqual(touchedStagesAfter(run, SCRIPT), []);
  });

  it('holds the run waiting on authentication-error without a retry or a Recovery call', async () => {
    handle = await startMockEngine({ fault: 'authentication-error' });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'waiting');
    assert.equal(run.state.status, 'waiting');
    if (run.state.status !== 'waiting') return;
    assert.equal(run.state.cause.kind, 'authentication');
    assert.ok(run.state.whatToDo.trim().length > 0, 'the owner is not told what to do');
    assert.equal(stepRecord(run, SCRIPT, 'execute').attempts, 1, 'an authentication error was retried');
    assert.equal(stepRecord(run, SCRIPT, 'execute').status, 'pending');
    assert.equal(recoveriesInStage(run, SCRIPT), 0);
    assert.equal(await recoveryEventCount(handle.runDir), 0);
  });

  it('ends the run failed on missing-output without ever accepting the execute step', async () => {
    handle = await startMockEngine({ fault: 'missing-output' });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'failed');
    if (run.state.status !== 'failed') throw new Error(`expected a failed run, got ${run.state.status}`);
    assert.notEqual(run.state.stepKey, null);
    if (run.state.stepKey !== null) assert.equal(parseStepKey(run.state.stepKey).stageId, SCRIPT);
    assert.equal(stepRecord(run, SCRIPT, 'execute').status, 'failed');
    assert.equal(stepRecord(run, SCRIPT, 'verify').status, 'pending', 'verify ran although execute left no output');
    assert.deepEqual(touchedStagesAfter(run, SCRIPT), []);
  });

  it('applies a fault to the stage the switch names and leaves later stages untouched', async () => {
    handle = await startMockEngine({ fault: 'step-failure@plan' });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'failed');
    if (run.state.status !== 'failed') throw new Error(`expected a failed run, got ${run.state.status}`);
    assert.notEqual(run.state.stepKey, null);
    if (run.state.stepKey !== null) assert.equal(parseStepKey(run.state.stepKey).stageId, 'plan');
    assert.deepEqual(touchedStagesAfter(run, 'plan'), []);
  });
});
