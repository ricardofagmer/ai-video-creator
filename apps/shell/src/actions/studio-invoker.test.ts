import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  StudioInvoker,
  UNRESPONSIVE_AFTER_MS,
  type InvokerStatus,
  type ProcessExit,
  type SpawnRequest,
  type Spawner,
} from './studio-invoker';

/*
 * R3-AC-25.5: start and stop run the configured Node binary with `[cliMain, 'start' | 'stop']`, no
 * shell and exactly the allowlisted environment; exit codes 0, 5 and 1 map to the three outcomes; a
 * second action while one is in flight is refused. The fake child exposes no way to be signalled.
 */

const config = {
  nodeBinary: '/opt/homebrew/bin/node',
  cliMain: '/Users/owner/video-studio/tools/cli/dist/main.js',
  dataHome: '/Users/owner/.video-studio',
  webPort: 4310,
  apiPort: 4311,
};

const parentEnvironment = {
  PATH: '/usr/bin:/bin',
  HOME: '/Users/owner',
  TMPDIR: '/var/folders/tmp/',
  LANG: 'pt_BR.UTF-8',
  NODE_OPTIONS: '--require /tmp/inject.js',
  ANTHROPIC_API_KEY: 'not-a-real-key',
  ENGINEOS_VIDEO_CREATOR_HOME: '/somewhere/else',
};

interface FakeSpawn {
  readonly spawner: Spawner;
  readonly requests: SpawnRequest[];
  exit(exit: ProcessExit): void;
}

function fakeSpawner(): FakeSpawn {
  const requests: SpawnRequest[] = [];
  const listeners: Array<(exit: ProcessExit) => void> = [];
  return {
    requests,
    spawner: (request) => {
      requests.push(request);
      return { onceSettled: (listener) => listeners.push(listener) };
    },
    exit: (exit) => {
      for (const listener of listeners.splice(0)) listener(exit);
    },
  };
}

interface FakeTimers {
  readonly startTimer: (delayMs: number, callback: () => void) => () => void;
  fire(): void;
  readonly delays: number[];
}

function fakeTimers(): FakeTimers {
  const pending: Array<() => void> = [];
  const delays: number[] = [];
  return {
    delays,
    startTimer: (delayMs, callback) => {
      delays.push(delayMs);
      pending.push(callback);
      return () => {
        const index = pending.indexOf(callback);
        if (index >= 0) pending.splice(index, 1);
      };
    },
    fire: () => {
      for (const callback of pending.splice(0)) callback();
    },
  };
}

function invoker(spawn: FakeSpawn, timers: FakeTimers = fakeTimers()): StudioInvoker {
  return new StudioInvoker({ config, parentEnvironment, spawner: spawn.spawner, startTimer: timers.startTimer });
}

describe('studio invocation (R3-AC-25.5)', () => {
  it('start spawns the node binary once with [cliMain, start], no shell and the allowlisted environment', () => {
    const spawn = fakeSpawner();
    const request = invoker(spawn).request('start');
    assert.equal(request.status, 'accepted');
    assert.equal(spawn.requests.length, 1);
    const [spawned] = spawn.requests;
    assert.ok(spawned);
    assert.equal(spawned.command, config.nodeBinary);
    assert.deepEqual(spawned.args, [config.cliMain, 'start']);
    assert.equal(spawned.shell, false);
    assert.deepEqual(Object.keys(spawned.env).sort(), ['HOME', 'LANG', 'PATH', 'TMPDIR', 'ENGINEOS_VIDEO_CREATOR_API_PORT', 'ENGINEOS_VIDEO_CREATOR_HOME', 'ENGINEOS_VIDEO_CREATOR_WEB_PORT']);
    assert.equal(spawned.env['ENGINEOS_VIDEO_CREATOR_HOME'], config.dataHome);
    assert.equal(spawned.env['ENGINEOS_VIDEO_CREATOR_WEB_PORT'], '4310');
    assert.equal(spawned.env['ENGINEOS_VIDEO_CREATOR_API_PORT'], '4311');
    assert.equal(spawned.env['PATH'], '/usr/bin:/bin');
    spawn.exit({ kind: 'exited', code: 0 });
  });

  it('stop spawns [cliMain, stop]', () => {
    const spawn = fakeSpawner();
    invoker(spawn).request('stop');
    assert.deepEqual(spawn.requests[0]?.args, [config.cliMain, 'stop']);
  });

  it('uses the fixed PATH fallback when the shell has no PATH', () => {
    const spawn = fakeSpawner();
    new StudioInvoker({ config, parentEnvironment: {}, spawner: spawn.spawner, startTimer: fakeTimers().startTimer }).request('start');
    assert.deepEqual(spawn.requests[0]?.env, {
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      ENGINEOS_VIDEO_CREATOR_HOME: config.dataHome,
      ENGINEOS_VIDEO_CREATOR_WEB_PORT: '4310',
      ENGINEOS_VIDEO_CREATOR_API_PORT: '4311',
    });
  });

  for (const [code, expected] of [
    [0, { kind: 'succeeded' }],
    [5, { kind: 'dependency-unavailable' }],
    [1, { kind: 'failed', exitCode: 1 }],
  ] as const) {
    it(`maps exit code ${code} to ${expected.kind}`, async () => {
      const spawn = fakeSpawner();
      const studio = invoker(spawn);
      const request = studio.request('start');
      assert.equal(request.status, 'accepted');
      spawn.exit({ kind: 'exited', code });
      const report = await request.completion;
      assert.deepEqual(report, { action: 'start', outcome: expected });
      assert.deepEqual(studio.current(), { phase: 'idle', last: report });
    });
  }

  it('maps a spawn error to a failure', async () => {
    const spawn = fakeSpawner();
    const request = invoker(spawn).request('stop');
    assert.equal(request.status, 'accepted');
    spawn.exit({ kind: 'spawn-error' });
    assert.deepEqual(await request.completion, { action: 'stop', outcome: { kind: 'failed', exitCode: null } });
  });

  it('refuses a second action while one is in flight, then accepts after it ends', async () => {
    const spawn = fakeSpawner();
    const studio = invoker(spawn);
    const first = studio.request('start');
    assert.deepEqual(studio.request('stop'), { status: 'refused', reason: 'action-in-flight' });
    assert.deepEqual(studio.request('start'), { status: 'refused', reason: 'action-in-flight' });
    assert.equal(spawn.requests.length, 1);
    spawn.exit({ kind: 'exited', code: 0 });
    assert.equal(first.status, 'accepted');
    await first.completion;
    assert.equal(studio.request('stop').status, 'accepted');
    assert.equal(spawn.requests.length, 2);
  });

  it('reports a child silent for 60 s as unresponsive, keeps it in flight and never ends it', async () => {
    const spawn = fakeSpawner();
    const timers = fakeTimers();
    const studio = invoker(spawn, timers);
    const seen: InvokerStatus[] = [];
    studio.subscribe((status) => seen.push(status));
    const request = studio.request('start');
    assert.deepEqual(timers.delays, [UNRESPONSIVE_AFTER_MS]);
    timers.fire();
    assert.deepEqual(studio.current(), { phase: 'unresponsive', action: 'start' });
    assert.deepEqual(studio.request('stop'), { status: 'refused', reason: 'action-in-flight' });
    spawn.exit({ kind: 'exited', code: 0 });
    assert.equal(request.status, 'accepted');
    assert.deepEqual(await request.completion, { action: 'start', outcome: { kind: 'succeeded' } });
    assert.deepEqual(
      seen.map((status) => status.phase),
      ['running', 'unresponsive', 'idle'],
    );
  });
});
