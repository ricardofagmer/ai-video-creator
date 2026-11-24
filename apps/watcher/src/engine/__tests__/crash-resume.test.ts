import 'reflect-metadata';
import assert from 'node:assert/strict';
import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { PLANNER_ROLE, WRITER_ROLE, type AgentOutput, type AgentPacket, type AgentRunOptions, type AgentsPort, type ModelRoleName } from '@studio/shared/agents';
import { readRunEvents, readRunFile } from '@studio/shared/run-files';
import { type RunEvent, type RunFile, type RunStatus, type StageId, type StageRecord, type StepName, type StepRecord } from '@studio/shared/run-format';
import { createWatcherHome, startMockEngine, stubProcessIdentity, type MockEngineHandle, type RunEngineResult } from '../../test-support';
import { AGENTS } from '../engine.tokens';

/*
 * Ticket 02 acceptance criterion 4 (CR2, PRD criterion 13): a watcher killed mid-step resumes from
 * the last completed step without redoing it. Watcher A runs as another process (stubbed pid) with
 * the simulated SIGTERM bound, and is shut down while the Scriptwriter call of the `script` stage's
 * `execute` step is in flight. The run folder is copied exactly as A leaves it, before the harness
 * removes A's runs root, and watcher B (the real pid) executes the copy. The model boundary
 * (`AgentsPort`) is wrapped to hold the call open and to count which agents each watcher called.
 */

const SCRIPT: StageId = 'script';
const STAGES_BEFORE_SCRIPT: readonly StageId[] = ['plan', 'research', 'verify'];
const SCRIPT_STEPS_BEFORE_EXECUTE: readonly StepName[] = ['brief', 'preflight', 'snapshot'];
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

/** A pid that is not this process, so watcher A and watcher B are different owners. */
const crashedPid = process.pid === 424_242 ? 424_243 : 424_242;

type AgentCallHook = (call: { role: ModelRoleName; signal: AbortSignal | undefined }) => Promise<void>;

interface CrashedRun {
  resultA: RunEngineResult;
  captured: RunFile;
  capturedEvents: RunEvent[];
  capturedDir: string;
}

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

function stepRecord(run: RunFile, stageId: StageId, step: StepName): StepRecord {
  const record = run.stages.find((stage) => stage.stageId === stageId)?.steps.find((candidate) => candidate.step === step);
  if (record === undefined) throw new Error(`the fixture run has no ${stageId} ${step} step`);
  return record;
}

function stageOf(run: RunFile, stageId: StageId): StageRecord {
  const stage = run.stages.find((candidate) => candidate.stageId === stageId);
  if (stage === undefined) throw new Error(`the fixture run has no ${stageId} stage`);
  return stage;
}

function runStatusMoves(events: readonly RunEvent[]): [RunStatus | null, RunStatus][] {
  return events.flatMap((event): [RunStatus | null, RunStatus][] => (event.type === 'run.status' ? [[event.from, event.to]] : []));
}

describe('crash-resume after a simulated SIGTERM (ticket 02 criterion 4, PRD criterion 13)', () => {
  let watcherA: MockEngineHandle | undefined;
  let watcherB: MockEngineHandle | undefined;
  let copyHome: { root: string; close(): Promise<void> } | undefined;
  let restorePid: (() => void) | undefined;

  beforeEach(() => {
    for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
  });

  afterEach(async () => {
    restorePid?.();
    restorePid = undefined;
    await watcherA?.shutdown();
    await watcherB?.shutdown();
    await copyHome?.close();
    watcherA = undefined;
    watcherB = undefined;
    copyHome = undefined;
    mock.restoreAll();
  });

  /** Kills watcher A inside the script stage's `execute` step and keeps a copy of the run folder it leaves. */
  async function crashDuringScriptExecute(): Promise<CrashedRun> {
    restorePid = stubProcessIdentity(crashedPid);
    const engine = await startMockEngine({ shutdown: 'sigterm-simulated' });
    watcherA = engine;
    restorePid();

    const home = await createWatcherHome({ prefix: 'engine-crash-copy' });
    copyHome = home;
    const capturedDir = join(home.root, 'run');
    // The harness closes the app after the execution settles and before it removes the runs root.
    const originalClose = engine.app.close.bind(engine.app);
    mock.method(engine.app, 'close', async (): Promise<void> => {
      await cp(engine.runDir, capturedDir, { recursive: true });
      await originalClose();
    });

    let reachedExecute: () => void = () => undefined;
    const inExecute = new Promise<void>((resolve) => {
      reachedExecute = resolve;
    });
    interceptAgents(engine, async ({ role, signal }) => {
      if (role !== WRITER_ROLE) return;
      reachedExecute();
      await untilAborted(signal);
    });

    const execution = engine.execute();
    await inExecute;
    await engine.shutdown();
    const resultA = await execution;

    const captured = await readRunFile(capturedDir);
    const capturedEvents = (await readRunEvents(capturedDir)).entries;
    return { resultA, captured, capturedEvents, capturedDir };
  }

  async function resumeOnWatcherB(capturedDir: string): Promise<{ result: RunEngineResult; calls: ModelRoleName[]; engine: MockEngineHandle }> {
    const engine = await startMockEngine();
    watcherB = engine;
    await rm(engine.runDir, { recursive: true, force: true });
    await cp(capturedDir, engine.runDir, { recursive: true });
    const calls = interceptAgents(engine, async () => undefined);
    const result = await engine.execute();
    return { result, calls, engine };
  }

  it('leaves the run and its step running, not interrupted, when SIGTERM aborts a step', async () => {
    const { resultA, captured, capturedEvents } = await crashDuringScriptExecute();

    assert.equal(resultA.status, 'running');
    assert.equal(captured.state.status, 'running');
    if (captured.state.status === 'running') assert.equal(captured.state.pid, crashedPid);
    assert.equal(stepRecord(captured, SCRIPT, 'execute').status, 'running');
    assert.ok(!capturedEvents.some((event) => event.type === 'control.request'), 'a shutdown was recorded as an owner request');
    assert.ok(!runStatusMoves(capturedEvents).some(([, to]) => to === 'interrupted'), 'watcher A recorded interrupted itself');
  });

  it('resumes from the interrupted step without redoing completed stages or steps', async () => {
    const { captured, capturedDir } = await crashDuringScriptExecute();

    const { result, calls, engine } = await resumeOnWatcherB(capturedDir);

    const resumed = await readRunFile(engine.runDir);
    assert.equal(result.status, 'review');
    assert.ok(!calls.includes(PLANNER_ROLE), 'watcher B planned the run again');
    assert.equal(calls.filter((role) => role === WRITER_ROLE).length, 1, 'watcher B did not write the script exactly once');
    for (const stageId of STAGES_BEFORE_SCRIPT) {
      const before = stageOf(captured, stageId);
      const after = stageOf(resumed, stageId);
      assert.equal(before.outcome.status, 'delivered', `${stageId} was not delivered before the crash`);
      assert.deepEqual(after.outcome, before.outcome, `${stageId} was delivered again`);
      assert.deepEqual(
        after.steps.map((record) => [record.attempts, record.startedAt]),
        before.steps.map((record) => [record.attempts, record.startedAt]),
        `a step of ${stageId} ran again`,
      );
    }
    for (const step of SCRIPT_STEPS_BEFORE_EXECUTE) {
      const before = stepRecord(captured, SCRIPT, step);
      const after = stepRecord(resumed, SCRIPT, step);
      assert.deepEqual([after.attempts, after.startedAt], [before.attempts, before.startedAt], `script ${step} ran again`);
    }
    assert.equal(stepRecord(resumed, SCRIPT, 'execute').attempts, stepRecord(captured, SCRIPT, 'execute').attempts + 1);
  });

  it('records the crash as interrupted and returns the orphaned step to pending before taking the run again', async () => {
    const { captured, capturedEvents, capturedDir } = await crashDuringScriptExecute();
    const orphanedAttempt = Math.max(1, stepRecord(captured, SCRIPT, 'execute').attempts);

    const { engine } = await resumeOnWatcherB(capturedDir);

    const newEvents = (await readRunEvents(engine.runDir)).entries.slice(capturedEvents.length);
    const moves = runStatusMoves(newEvents);
    assert.deepEqual(moves.slice(0, 2), [
      ['running', 'interrupted'],
      ['interrupted', 'running'],
    ]);
    assert.deepEqual(moves.at(-1), ['running', 'review']);
    assert.ok(
      newEvents.some((event) => event.type === 'step.status' && event.status === 'pending' && event.stepKey === `${SCRIPT}:execute:${orphanedAttempt}`),
      'the orphaned step was not reported back to pending',
    );
  });
});
