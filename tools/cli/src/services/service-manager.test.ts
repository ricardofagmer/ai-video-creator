import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { isProcessAlive } from '@studio/shared/run-files';
import { ServiceProcessMismatchError } from '../errors/service.errors.js';
import { serviceState, startService, stopService } from './service-manager.js';
import { readPidFile, writePidFile } from './service-pid-file.js';
import { type ServiceSpec } from './service-spec.js';

/*
 * docs/specs/2026-11-24-installer-upgrade-guards-design.md, gap 1, against real processes: a child
 * started from a folder whose name holds spaces (as "EngineOS Video Creator.app" does) is the
 * recorded service, for this copy and for another copy's record alike; a pid that does not run the
 * recorded entry file is never signalled.
 *
 * The manager reads command lines with `/bin/ps`, which a command sandbox may refuse; the suite is
 * skipped there rather than reported as passing.
 */

const psPermitted = spawnSync('/bin/ps', ['-p', String(process.pid)], { stdio: 'ignore' }).status === 0;

/** A port nothing is started on: no test here launches a service or probes a listener. */
const UNUSED_PORT = 4311;

/** Outlives the test body unless stopped: it only waits. */
const IDLE_PROGRAM = 'setInterval(() => undefined, 1000);\n';

let root = '';
const started: number[] = [];

async function entryFile(folder: string): Promise<string> {
  const directory = join(root, folder);
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'main.js');
  await writeFile(file, IDLE_PROGRAM, 'utf8');
  return file;
}

/** Detached, as `studio start` launches a service, so the pid is its own process group. */
function startIdle(entryPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], { detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => {
      if (child.pid === undefined) {
        reject(new Error('spawned child has no pid'));
        return;
      }
      started.push(child.pid);
      child.unref();
      resolve(child.pid);
    });
  });
}

function spec(name: string, entryPath: string): ServiceSpec {
  return {
    name: 'api',
    executable: process.execPath,
    entryPath,
    args: [entryPath],
    cwd: root,
    env: { PATH: '/usr/bin:/bin' },
    port: UNUSED_PORT,
    healthPath: '/health',
    pidFile: join(root, `${name}.pid.json`),
    processLog: join(root, `${name}.process.log`),
  };
}

async function record(target: ServiceSpec, pid: number, entryPath: string): Promise<void> {
  await writePidFile(target.pidFile, { service: 'api', pid, startedAt: new Date().toISOString(), entryPath, port: UNUSED_PORT });
}

describe('service manager: recorded identity', { skip: psPermitted ? false : '/bin/ps is not permitted here' }, () => {
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio cli services '));
  });

  after(async () => {
    for (const pid of started) {
      if (isProcessAlive(pid)) process.kill(pid, 'SIGKILL');
    }
    await rm(root, { recursive: true, force: true });
  });

  it('stop ends the recorded service when its entry path holds spaces', async () => {
    const entryPath = await entryFile('EngineOS Video Creator.app');
    const target = spec('stop-current', entryPath);
    const pid = await startIdle(entryPath);
    await record(target, pid, entryPath);

    assert.deepEqual(await stopService(target), { status: 'stopped', pid });
    assert.equal(isProcessAlive(pid), false);
    assert.equal((await readPidFile(target.pidFile)).status, 'absent');
  });

  it('stop ends a service another app copy recorded', async () => {
    const previousEntry = await entryFile('Previous Copy.app');
    const currentEntry = await entryFile('Current Copy.app');
    const target = spec('stop-previous', currentEntry);
    const pid = await startIdle(previousEntry);
    await record(target, pid, previousEntry);

    assert.deepEqual(await stopService(target), { status: 'stopped', pid });
    assert.equal(isProcessAlive(pid), false);
  });

  it('stop never signals a pid that does not run the recorded entry file', async () => {
    const recordedEntry = await entryFile('Recorded Copy.app');
    const otherEntry = await entryFile('Unrelated Program');
    const target = spec('stop-foreign', recordedEntry);
    const pid = await startIdle(otherEntry);
    await record(target, pid, recordedEntry);

    await assert.rejects(stopService(target), ServiceProcessMismatchError);
    assert.equal(isProcessAlive(pid), true);
    assert.equal((await readPidFile(target.pidFile)).status, 'absent');
  });

  it('start reports the recorded service of this copy as already running', async () => {
    const entryPath = await entryFile('Running Copy.app');
    const target = spec('start-current', entryPath);
    const pid = await startIdle(entryPath);
    await record(target, pid, entryPath);

    assert.deepEqual(await startService(target, new AbortController().signal), { status: 'already-running', pid, port: UNUSED_PORT });
    assert.deepEqual(await serviceState(target), { status: 'running', pid });
  });

  it('doctor reports the recorded service of another copy as a foreign record and keeps the record', async () => {
    const previousEntry = await entryFile('Older Copy.app');
    const currentEntry = await entryFile('Newer Copy.app');
    const target = spec('state-previous', currentEntry);
    const pid = await startIdle(previousEntry);
    await record(target, pid, previousEntry);

    assert.deepEqual(await serviceState(target), { status: 'foreign-record', pid });
    assert.equal((await readPidFile(target.pidFile)).status, 'present');
  });
});
