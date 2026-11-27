import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { readRunEvents, readRunFile } from '@studio/shared/run-files';
import { type RunEvent, type RunStatus, type StepName, type StepStatus } from '@studio/shared/run-format';
import { startMockEngine, type MockEngineHandle } from '../../test-support';
import { IllegalRunTransitionError, IllegalStepTransitionError, RunNotRunnableError } from '../engine.errors';
import { assertRunTransition, assertStepReopen, assertStepTransition } from '../transitions';

/*
 * Ticket 02 acceptance criterion 1 (CR2): every run and step move `transitions.ts` allows is
 * accepted, and forbidden moves are refused with their typed errors. The tables below restate C3
 * (PRD 7.2, ADR 0003 "Who writes what") on purpose, so a change to the product table fails here.
 * Two engine-level cases check that a real fixture run only takes allowed moves and that a run in
 * `review` is not started again. Nest log calls are replaced by no-ops so the run prints nothing.
 */

type RunMove = readonly [from: RunStatus, to: RunStatus];
type StepMove = readonly [from: StepStatus, to: StepStatus];

const allowedRunMoves: readonly RunMove[] = [
  ['pending', 'running'],
  ['running', 'waiting'],
  ['running', 'paused'],
  ['running', 'failed'],
  ['running', 'interrupted'],
  ['running', 'review'],
  ['running', 'rejected'],
  ['waiting', 'running'],
  ['paused', 'running'],
  ['failed', 'running'],
  ['interrupted', 'running'],
];

/** Moves owned by the api or CLI, or never valid at all. */
const forbiddenRunMoves: readonly RunMove[] = [
  ['draft', 'pending'],
  ['pending', 'review'],
  ['review', 'approved'],
  ['review', 'rejected'],
  ['running', 'approved'],
  ['approved', 'running'],
  ['rejected', 'running'],
];

const allowedStepMoves: readonly StepMove[] = [
  ['pending', 'running'],
  ['pending', 'skipped'],
  ['running', 'ok'],
  ['running', 'warning'],
  ['running', 'failed'],
  ['running', 'pending'],
  ['failed', 'running'],
];

const forbiddenStepMoves: readonly StepMove[] = [
  ['pending', 'ok'],
  ['ok', 'running'],
  ['warning', 'failed'],
  ['skipped', 'running'],
];

const reopenableStatuses: readonly StepStatus[] = ['pending', 'running', 'ok', 'warning', 'failed'];

const STEP: StepName = 'execute';

const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

function isRunStatusEvent(event: RunEvent): event is Extract<RunEvent, { type: 'run.status' }> {
  return event.type === 'run.status';
}

describe('assertRunTransition (ticket 02 criterion 1)', () => {
  for (const [from, to] of allowedRunMoves) {
    it(`allows the watcher to move a run from ${from} to ${to}`, () => {
      assert.doesNotThrow(() => assertRunTransition(from, to));
    });
  }

  for (const [from, to] of forbiddenRunMoves) {
    it(`refuses a run move from ${from} to ${to} with IllegalRunTransitionError`, () => {
      assert.throws(
        () => assertRunTransition(from, to),
        (error: unknown) => error instanceof IllegalRunTransitionError && error.from === from && error.to === to && error.category === 'internal',
      );
    });
  }
});

describe('assertStepTransition (ticket 02 criterion 1)', () => {
  for (const [from, to] of allowedStepMoves) {
    it(`allows a step to move from ${from} to ${to}`, () => {
      assert.doesNotThrow(() => assertStepTransition(STEP, from, to));
    });
  }

  for (const [from, to] of forbiddenStepMoves) {
    it(`refuses a step move from ${from} to ${to} with IllegalStepTransitionError`, () => {
      assert.throws(
        () => assertStepTransition(STEP, from, to),
        (error: unknown) => error instanceof IllegalStepTransitionError && error.step === STEP && error.from === from && error.to === to,
      );
    });
  }
});

describe('assertStepReopen (ticket 02 criterion 1)', () => {
  for (const from of reopenableStatuses) {
    it(`reopens a ${from} step back to pending`, () => {
      assert.doesNotThrow(() => assertStepReopen(STEP, from));
    });
  }

  it('refuses to reopen a skipped step with IllegalStepTransitionError', () => {
    assert.throws(
      () => assertStepReopen(STEP, 'skipped'),
      (error: unknown) => error instanceof IllegalStepTransitionError && error.from === 'skipped' && error.to === 'pending',
    );
  });
});

describe('RunEngine run status moves (ticket 02 criterion 1, engine level)', () => {
  let handle: MockEngineHandle | undefined;

  beforeEach(() => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
  });

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
    mock.restoreAll();
  });

  it('records only allowed run status moves on the way from pending to review', async () => {
    handle = await startMockEngine();

    const result = await handle.execute();

    const moves = (await readRunEvents(handle.runDir)).entries.filter(isRunStatusEvent);
    assert.equal(result.status, 'review');
    assert.ok(moves.length >= 2, 'the run recorded fewer than two status moves');
    assert.deepEqual([moves[0]?.from, moves[0]?.to], ['pending', 'running']);
    assert.deepEqual([moves.at(-1)?.from, moves.at(-1)?.to], ['running', 'review']);
    for (const move of moves) {
      const from = move.from;
      assert.notEqual(from, null, 'a run status event has no from status');
      if (from !== null) assert.doesNotThrow(() => assertRunTransition(from, move.to), `${from} -> ${move.to} is not allowed`);
    }
  });

  it('refuses to start a run that is in review again with RunNotRunnableError', async () => {
    handle = await startMockEngine();
    await handle.execute();

    await assert.rejects(handle.execute(), (error: unknown) => error instanceof RunNotRunnableError && error.status === 'review');
    assert.equal((await readRunFile(handle.runDir)).state.status, 'review');
  });
});
