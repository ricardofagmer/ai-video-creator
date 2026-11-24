import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { readApprovalFile, readControlRequest, readRunFile } from '@studio/shared/run-files';
import { InvalidMockFaultError } from '../mocks/mock-fault';
import {
  InvalidProcessIdError,
  InvalidWatcherHomePrefixError,
  createWatcherHome,
  startMockEngine,
  stubProcessIdentity,
  type MockEngineHandle,
} from './index';

/*
 * Ticket 01 acceptance criterion 2 (CR1): the mock engine runs the committed fixture to `review`
 * with every port mocked, stops in `waiting` without the plan approval, and `shutdown()` removes
 * its temp runs root. Also covers the watcher temp home and the process identity stub. Nest log
 * calls are replaced by no-ops so the run prints nothing.
 */

const FIXTURE_RUN_FILE = resolve(__dirname, '../../fixtures/product-tour-16x9/run.json');
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

beforeEach(() => {
  for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
});

afterEach(() => {
  mock.restoreAll();
});

describe('startMockEngine (ticket 01 criterion 2)', () => {
  let handle: MockEngineHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  it('runs the fixture to review with mock ports', async () => {
    handle = await startMockEngine();

    const result = await handle.execute();

    assert.equal(result.status, 'review');
    assert.equal((await readRunFile(handle.runDir)).state.status, 'review');
  });

  it('stops in waiting at the plan gate without the plan approval', async () => {
    handle = await startMockEngine({ withPlanApproval: false });

    const result = await handle.execute();

    assert.equal(result.status, 'waiting');
    assert.equal((await readApprovalFile(handle.runDir)).status, 'absent');
  });

  it('works on a copy inside a temp runs root and leaves the committed fixture unchanged', async () => {
    const before = await readFile(FIXTURE_RUN_FILE, 'utf8');
    handle = await startMockEngine();

    await handle.execute();

    const temporaryRoot = await realpath(tmpdir());
    assert.ok(handle.runDir.startsWith(`${temporaryRoot}${sep}`), 'the working copy is outside the temp folder');
    assert.equal(await readFile(FIXTURE_RUN_FILE, 'utf8'), before);
  });

  it('applies run overrides to the working copy', async () => {
    handle = await startMockEngine({ run: { title: 'Coverage override title' } });

    assert.equal((await readRunFile(handle.runDir)).title, 'Coverage override title');
  });

  it('hands the fault to the mock ports, so the run does not reach review', async () => {
    handle = await startMockEngine({ fault: 'authentication-error@script' });

    const result = await handle.execute();

    assert.notEqual(result.status, 'review');
  });

  it('refuses an unknown fault before starting anything', async () => {
    await assert.rejects(startMockEngine({ fault: 'no-such-fault' }), InvalidMockFaultError);
  });

  it('writes a control request into the run folder', async () => {
    handle = await startMockEngine();
    const request = { pause: true, stop: false, at: Date.parse('2026-11-21T12:00:00.000Z') };

    await handle.writeControl(request);

    assert.deepEqual(await readControlRequest(handle.runDir), { status: 'present', value: request });
  });
});

describe('MockEngineHandle.shutdown (ticket 01 criterion 2)', () => {
  let handle: MockEngineHandle | undefined;

  // A test that fails before its own shutdown still closes the app and removes the temp root.
  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  it('removes the runs root', async () => {
    handle = await startMockEngine();
    const runsRoot = dirname(handle.runDir);
    await handle.execute();

    await handle.shutdown();

    assert.equal(await pathExists(runsRoot), false);
  });

  it('waits for an in-flight execution before removing the runs root', async () => {
    handle = await startMockEngine({ shutdown: 'sigterm-simulated' });
    const runsRoot = dirname(handle.runDir);
    let executionSettled = false;
    const execution = handle.execute();
    const observed = execution.then(
      (): void => {
        executionSettled = true;
      },
      (): void => {
        executionSettled = true;
      },
    );

    await handle.shutdown();

    assert.equal(executionSettled, true, 'shutdown returned while the execution was still running');
    assert.equal(await pathExists(runsRoot), false);
    await observed;
  });

  it('can be called twice', async () => {
    handle = await startMockEngine();
    await handle.shutdown();

    await assert.doesNotReject(handle.shutdown());
  });
});

describe('createWatcherHome', () => {
  it('returns a realpath root under the realpath of os.tmpdir() and removes it on close', async () => {
    const home = await createWatcherHome({ prefix: 'watcher-home' });
    const temporaryRoot = await realpath(tmpdir());

    assert.ok(home.root.startsWith(`${temporaryRoot}${sep}`), 'root is outside the temp folder');
    await home.close();
    assert.equal(await pathExists(home.root), false);
  });

  it('refuses a prefix that holds a path segment', async () => {
    await assert.rejects(createWatcherHome({ prefix: '../escape' }), InvalidWatcherHomePrefixError);
  });
});

describe('stubProcessIdentity', () => {
  it('makes process.pid read the stubbed pid until restored', () => {
    const realPid = process.pid;
    const stubbedPid = realPid === 424_242 ? 424_243 : 424_242;

    const restore = stubProcessIdentity(stubbedPid);
    const whileStubbed = process.pid;
    restore();

    assert.equal(whileStubbed, stubbedPid);
    assert.equal(process.pid, realPid);
  });

  it('restores only once', () => {
    const realPid = process.pid;
    const restore = stubProcessIdentity(realPid + 1);
    restore();
    const second = stubProcessIdentity(realPid + 2);

    restore();

    assert.equal(process.pid, realPid + 2, 'a stale restore undid a newer stub');
    second();
    assert.equal(process.pid, realPid);
  });

  it('refuses a pid that is not a positive integer', () => {
    assert.throws(() => stubProcessIdentity(0), InvalidProcessIdError);
    assert.throws(() => stubProcessIdentity(-1), InvalidProcessIdError);
    assert.throws(() => stubProcessIdentity(1.5), InvalidProcessIdError);
  });
});
