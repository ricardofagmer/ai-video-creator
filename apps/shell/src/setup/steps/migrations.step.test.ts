import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveStudioRuntime } from '@studio/core/runtime';
import { type ProcessRequest, type ProcessResult } from '../process-runner';
import { type SetupFileSystem } from '../setup-file-system';
import { createSetupContext } from '../setup-plan';
import { type SetupContext } from '../setup-context';
import { migrationsStep } from './migrations.step';

/*
 * docs/specs/2026-11-24-installer-upgrade-guards-design.md, gap 1: after stopping the watcher agent
 * and the services, the step asks the machine who still uses the database and runs `migrate deploy`
 * only when nobody does. Every program is a fake: nothing here touches launchd, a port or a database.
 */

const RUNTIME_ROOT = '/Applications/EngineOS Video Creator.app/Contents/Resources/runtime';
const DATA_HOME = '/Users/owner/Library/Application Support/VideoStudio';
const DATABASE_FILE = `${DATA_HOME}/db/studio.sqlite`;
const API_PORT = 4311;

type Program = 'agent-print' | 'cli-stop' | 'port-probe' | 'file-probe' | 'migrate-deploy';

/** `launchctl print` exit code for a service that is not loaded. */
const AGENT_NOT_LOADED = 113;

const FREE: ProcessResult = { kind: 'exited', code: 1, stdout: '' };

function held(pid: number): ProcessResult {
  return { kind: 'exited', code: 0, stdout: `${pid}\n` };
}

/** Never reached by this step; a call would mean the step read or wrote setup's record. */
const untouchedFiles: SetupFileSystem = {
  inspect: () => Promise.resolve({ kind: 'absent' }),
  makeFolder: () => Promise.reject(new Error('unexpected makeFolder')),
  setMode: () => Promise.reject(new Error('unexpected setMode')),
  readText: () => Promise.resolve({ status: 'absent' }),
  writeTextAtomic: () => Promise.reject(new Error('unexpected writeTextAtomic')),
  removeFile: () => Promise.reject(new Error('unexpected removeFile')),
  sha256: () => Promise.resolve(null),
};

interface Machine {
  /** One answer per probe, in order; the last one repeats. */
  readonly portAnswers: readonly ProcessResult[];
  readonly fileAnswers: readonly ProcessResult[];
  readonly stopExitCode?: number;
  readonly deployExitCode?: number;
}

interface Harness {
  readonly context: SetupContext;
  readonly calls: Program[];
  readonly pauses: number[];
}

function nextAnswer(answers: readonly ProcessResult[], asked: number): ProcessResult {
  return answers[Math.min(asked, answers.length - 1)] ?? FREE;
}

function harness(machine: Machine): Harness {
  const runtime = resolveStudioRuntime({ override: RUNTIME_ROOT, fileSystem: { isDirectory: () => true } });
  if (runtime.mode !== 'packaged') throw new Error('expected a packaged runtime');
  const calls: Program[] = [];
  const pauses: number[] = [];

  const classify = (request: ProcessRequest): Program => {
    if (request.command === '/bin/launchctl' && request.args[0] === 'print') return 'agent-print';
    if (request.command === '/usr/sbin/lsof') return request.args.includes('-sTCP:LISTEN') ? 'port-probe' : 'file-probe';
    if (request.command === runtime.nodeBinary && request.args[1] === 'stop') return 'cli-stop';
    if (request.command === runtime.nodeBinary && request.args[1] === 'migrate' && request.args[2] === 'deploy') return 'migrate-deploy';
    throw new Error(`unexpected program: ${request.command} ${request.args.join(' ')}`);
  };

  const answer = (program: Program, request: ProcessRequest): ProcessResult => {
    const asked = calls.filter((call) => call === program).length - 1;
    switch (program) {
      case 'agent-print':
        return { kind: 'exited', code: AGENT_NOT_LOADED, stdout: '' };
      case 'cli-stop':
        return { kind: 'exited', code: machine.stopExitCode ?? 0, stdout: '' };
      case 'port-probe':
        assert.ok(request.args.includes(`-iTCP:${API_PORT}`));
        return nextAnswer(machine.portAnswers, asked);
      case 'file-probe':
        assert.equal(request.args.at(-1), DATABASE_FILE);
        return nextAnswer(machine.fileAnswers, asked);
      case 'migrate-deploy':
        return { kind: 'exited', code: machine.deployExitCode ?? 0, stdout: '' };
    }
  };

  const context = createSetupContext(
    {
      runtime,
      appBundle: '/Applications/EngineOS Video Creator.app',
      appVersion: '0.1.0',
      homeDirectory: '/Users/owner',
      dataHome: DATA_HOME,
      uid: 501,
      ports: { web: 4310, api: API_PORT },
      parentEnvironment: { HOME: '/Users/owner' },
    },
    {
      run: (request) => {
        const program = classify(request);
        calls.push(program);
        return Promise.resolve(answer(program, request));
      },
      files: untouchedFiles,
      clock: () => new Date('2026-11-24T10:39:00.000Z'),
      pause: (milliseconds) => {
        pauses.push(milliseconds);
        return Promise.resolve();
      },
      log: () => undefined,
      isProcessAlive: () => false,
    },
    { requestPassphrase: () => Promise.resolve({ kind: 'cancelled' }), requestConsent: () => Promise.resolve('declined') },
  );
  return { context, calls, pauses };
}

describe('migrations step: refuses while the database is in use', () => {
  it('stops the agent and the services, asks the machine, then deploys when nothing holds the database', async () => {
    const { context, calls, pauses } = harness({ portAnswers: [FREE], fileAnswers: [FREE] });
    assert.deepEqual(await migrationsStep(context).run(), { kind: 'done' });
    assert.deepEqual(calls, ['agent-print', 'cli-stop', 'port-probe', 'file-probe', 'migrate-deploy']);
    assert.deepEqual(pauses, []);
  });

  it('never deploys while something still listens on the API port', async () => {
    const { context, calls, pauses } = harness({ portAnswers: [held(41067)], fileAnswers: [FREE] });
    assert.deepEqual(await migrationsStep(context).run(), { kind: 'failed', reason: 'api-still-running' });
    assert.equal(calls.includes('migrate-deploy'), false);
    assert.equal(calls.filter((call) => call === 'port-probe').length, 6);
    assert.deepEqual(pauses, [500, 500, 500, 500, 500]);
  });

  it('never deploys while another process has the database file open', async () => {
    const { context, calls } = harness({ portAnswers: [FREE], fileAnswers: [held(22498)] });
    assert.deepEqual(await migrationsStep(context).run(), { kind: 'failed', reason: 'database-in-use' });
    assert.equal(calls.includes('migrate-deploy'), false);
    assert.equal(calls.filter((call) => call === 'file-probe').length, 6);
  });

  it('deploys once a stopping service lets go within the wait', async () => {
    const { context, calls, pauses } = harness({ portAnswers: [held(41067), held(41067), FREE], fileAnswers: [held(41067), FREE] });
    assert.deepEqual(await migrationsStep(context).run(), { kind: 'done' });
    assert.equal(calls.filter((call) => call === 'migrate-deploy').length, 1);
    assert.equal(calls.at(-1), 'migrate-deploy');
    assert.deepEqual(pauses, [500, 500, 500]);
  });

  it('fails closed when the machine gives no answer', async () => {
    const { context, calls } = harness({ portAnswers: [{ kind: 'spawn-error' }], fileAnswers: [FREE] });
    assert.deepEqual(await migrationsStep(context).run(), { kind: 'failed', reason: 'api-still-running' });
    assert.equal(calls.includes('migrate-deploy'), false);
  });

  it('lets the machine decide when `studio stop` itself reported a failure', async () => {
    const stopFailedButFree = harness({ portAnswers: [FREE], fileAnswers: [FREE], stopExitCode: 4 });
    assert.deepEqual(await migrationsStep(stopFailedButFree.context).run(), { kind: 'done' });
    const stopOkButHeld = harness({ portAnswers: [held(41067)], fileAnswers: [FREE], stopExitCode: 0 });
    assert.deepEqual(await migrationsStep(stopOkButHeld.context).run(), { kind: 'failed', reason: 'api-still-running' });
  });

  it('still reports a deploy that fails on a free database as migrations-failed', async () => {
    const { context } = harness({ portAnswers: [FREE], fileAnswers: [FREE], deployExitCode: 1 });
    assert.deepEqual(await migrationsStep(context).run(), { kind: 'failed', reason: 'migrations-failed' });
  });
});
