import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { WRITER_ROLE, type AgentOutput, type AgentPacket, type AgentRunOptions, type AgentsPort, type ModelRoleName } from '@studio/shared/agents';
import { readRunEvents, readRunFile } from '@studio/shared/run-files';
import { type RunEvent, type RunFile, type RunStatus, type StageId, type StepName, type StepRecord, type StepStatus } from '@studio/shared/run-format';
import { startMockEngine, type MockEngineHandle, type RunEngineResult } from '../../test-support';
import { ResumeNotRequestedError } from '../engine.errors';
import { AGENTS } from '../engine.tokens';

/*
 * Ticket 02 acceptance criterion 2 (CR2): `control.json` as the engine applies it (PRD 7.3,
 * RUN-FORMAT 12, criterion 14 engine side). `pause: true` lets the running step finish and ends the
 * run `paused` before the next step; `pause: false` cancels a pause; `stop` aborts the step, leaves
 * it `pending` and ends the run `interrupted`; `stop` wins over `pause`. Requests are written at an
 * exact moment by wrapping the mock `AgentsPort` (the model boundary): the Scriptwriter call runs
 * inside the `execute` step of the `script` stage, so a request written there lands mid-step.
 */

const CONTROL_AT = Date.parse('2026-11-21T12:00:00.000Z');
const SCRIPT: StageId = 'script';
/** C3 step order: `verify` follows `execute`. */
const NEXT_STEP_AFTER_EXECUTE: StepName = 'verify';
const EVENT_WAIT_MS = 5_000;
const finishedStatuses: ReadonlySet<StepStatus> = new Set<StepStatus>(['ok', 'warning']);
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

type AgentCallHook = (call: { role: ModelRoleName; signal: AbortSignal | undefined }) => Promise<void>;

/** Wraps the engine's mock `AgentsPort`: every call is recorded and passes through `hook` first. */
function interceptAgents(handle: MockEngineHandle, hook: AgentCallHook): ModelRoleName[] {
  const agents = handle.app.get<AgentsPort>(AGENTS);
  const original = agents.run.bind(agents);
  const calls: ModelRoleName[] = [];
  mock.method(
    agents,
    'run',
    async <Role extends ModelRoleName>(role: Role, packet: AgentPacket<Role>, options?: AgentRunOptions): Promise<AgentOutput<Role>> => {
      calls.push(role);
      await hook({ role, signal: options?.signal });
      return original(role, packet, options);
    },
  );
  return calls;
}

/** Runs `action` once, inside the first Scriptwriter call (the `script` stage's `execute` step). */
function onFirstWriterCall(action: (signal: AbortSignal | undefined) => Promise<void>): AgentCallHook {
  let fired = false;
  return async ({ role, signal }) => {
    if (role !== WRITER_ROLE || fired) return;
    fired = true;
    await action(signal);
  };
}

/** Rejects once the engine aborts the step's signal; a call without a signal fails at once instead of hanging. */
function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  if (signal === undefined) return Promise.reject(new Error('the engine passed no AbortSignal to the agent call'));
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

async function waitForEvent(runDir: string, matches: (event: RunEvent) => boolean): Promise<void> {
  const deadline = Date.now() + EVENT_WAIT_MS;
  while (Date.now() < deadline) {
    if ((await readRunEvents(runDir)).entries.some(matches)) return;
    await delay(25);
  }
  throw new Error('the engine did not record the expected event in time');
}

function stepRecord(run: RunFile, stageId: StageId, step: StepName): StepRecord {
  const record = run.stages.find((stage) => stage.stageId === stageId)?.steps.find((candidate) => candidate.step === step);
  if (record === undefined) throw new Error(`the fixture run has no ${stageId} ${step} step`);
  return record;
}

function runningSteps(run: RunFile): string[] {
  return run.stages.flatMap((stage) => stage.steps.filter((record) => record.status === 'running').map((record) => `${stage.stageId}:${record.step}`));
}

function stepsNotPending(run: RunFile): string[] {
  return run.stages.flatMap((stage) => stage.steps.filter((record) => record.status !== 'pending').map((record) => `${stage.stageId}:${record.step}`));
}

async function runStatusTargets(runDir: string): Promise<RunStatus[]> {
  return (await readRunEvents(runDir)).entries.flatMap((event) => (event.type === 'run.status' ? [event.to] : []));
}

async function controlRequests(runDir: string): Promise<string[]> {
  return (await readRunEvents(runDir)).entries.flatMap((event) => (event.type === 'control.request' ? [event.request] : []));
}

async function pauseDuringScriptExecute(handle: MockEngineHandle): Promise<{ result: RunEngineResult; calls: ModelRoleName[] }> {
  const calls = interceptAgents(
    handle,
    onFirstWriterCall(async () => {
      await handle.writeControl({ pause: true, stop: false, at: CONTROL_AT });
    }),
  );
  const result = await handle.execute();
  return { result, calls };
}

describe('control.json pause (ticket 02 criterion 2)', () => {
  let handle: MockEngineHandle | undefined;

  beforeEach(() => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
  });

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
    mock.restoreAll();
  });

  it('lets the step running when pause: true arrives finish, then ends the run paused before the next step', async () => {
    handle = await startMockEngine();

    const { result } = await pauseDuringScriptExecute(handle);

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'paused');
    assert.equal(run.state.status, 'paused');
    assert.ok(finishedStatuses.has(stepRecord(run, SCRIPT, 'execute').status), 'the step running when the pause arrived did not finish');
    assert.equal(stepRecord(run, SCRIPT, NEXT_STEP_AFTER_EXECUTE).status, 'pending');
    assert.deepEqual(runningSteps(run), []);
    assert.ok((await controlRequests(handle.runDir)).includes('pause'), 'the pause request was not recorded');
  });

  it('holds the run paused before any step when pause: true is present at start', async () => {
    handle = await startMockEngine();
    await handle.writeControl({ pause: true, stop: false, at: CONTROL_AT });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'paused');
    assert.deepEqual(stepsNotPending(run), []);
  });

  it('continues a paused run from the next step on a resume request, without rerunning the finished step', async () => {
    handle = await startMockEngine();
    const { calls } = await pauseDuringScriptExecute(handle);
    await handle.writeControl({ pause: false, stop: false, resume: true, at: CONTROL_AT + 1_000 });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'review');
    assert.equal(stepRecord(run, SCRIPT, 'execute').attempts, 1);
    assert.equal(calls.filter((role) => role === WRITER_ROLE).length, 1, 'the Scriptwriter ran again after resume');
  });

  it('refuses to continue a paused run without a resume request with ResumeNotRequestedError', async () => {
    handle = await startMockEngine();
    await pauseDuringScriptExecute(handle);

    await assert.rejects(handle.execute(), (error: unknown) => error instanceof ResumeNotRequestedError && error.status === 'paused');
    assert.equal((await readRunFile(handle.runDir)).state.status, 'paused');
  });

  it('cancels a pause the watcher has already seen when pause: false is written before the step ends', async () => {
    const engine = await startMockEngine();
    handle = engine;
    interceptAgents(
      engine,
      onFirstWriterCall(async () => {
        await engine.writeControl({ pause: true, stop: false, at: CONTROL_AT });
        // The step watch acknowledges the pause while the step keeps running (criterion 14).
        await waitForEvent(engine.runDir, (event) => event.type === 'control.request' && event.request === 'pause');
        await engine.writeControl({ pause: false, stop: false, at: CONTROL_AT + 1 });
      }),
    );

    const result = await engine.execute();

    assert.equal(result.status, 'review');
    assert.ok(!(await runStatusTargets(engine.runDir)).includes('paused'), 'the cancelled pause still paused the run');
  });

  it('cancels a pause when pause: false replaces it before the watcher acts', async () => {
    handle = await startMockEngine();
    await handle.writeControl({ pause: true, stop: false, at: CONTROL_AT });
    await handle.writeControl({ pause: false, stop: false, at: CONTROL_AT + 1 });

    const result = await handle.execute();

    assert.equal(result.status, 'review');
    assert.ok(!(await runStatusTargets(handle.runDir)).includes('paused'));
  });
});

describe('control.json stop (ticket 02 criterion 2)', () => {
  let handle: MockEngineHandle | undefined;

  beforeEach(() => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
  });

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
    mock.restoreAll();
  });

  it('aborts the running step on stop, leaves it pending and ends the run interrupted', async () => {
    const engine = await startMockEngine();
    handle = engine;
    interceptAgents(
      engine,
      onFirstWriterCall(async (signal) => {
        await engine.writeControl({ pause: false, stop: true, at: CONTROL_AT });
        await untilAborted(signal);
      }),
    );

    const result = await engine.execute();

    const run = await readRunFile(engine.runDir);
    assert.equal(result.status, 'interrupted');
    assert.equal(run.state.status, 'interrupted');
    assert.equal(stepRecord(run, SCRIPT, 'execute').status, 'pending');
    assert.deepEqual(runningSteps(run), []);
    assert.ok((await controlRequests(engine.runDir)).includes('stop'), 'the stop request was not recorded');
  });

  it('applies stop over pause when both arrive while a step runs', async () => {
    const engine = await startMockEngine();
    handle = engine;
    interceptAgents(
      engine,
      onFirstWriterCall(async (signal) => {
        await engine.writeControl({ pause: true, stop: true, at: CONTROL_AT });
        await untilAborted(signal);
      }),
    );

    const result = await engine.execute();

    const run = await readRunFile(engine.runDir);
    assert.equal(result.status, 'interrupted');
    assert.equal(stepRecord(run, SCRIPT, 'execute').status, 'pending');
    assert.ok(!(await runStatusTargets(engine.runDir)).includes('paused'), 'the run was paused although stop was requested');
  });

  it('applies stop over pause when both are present at start, before any step runs', async () => {
    handle = await startMockEngine();
    await handle.writeControl({ pause: true, stop: true, at: CONTROL_AT });

    const result = await handle.execute();

    const run = await readRunFile(handle.runDir);
    assert.equal(result.status, 'interrupted');
    assert.deepEqual(stepsNotPending(run), []);
    assert.ok(!(await runStatusTargets(handle.runDir)).includes('paused'));
  });
});
