import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { RunFileSchemaError } from './errors';
import { BOOT_TIME_TOLERANCE_MS } from './process-identity';
import {
  claimWatcherPid,
  readWatcherPid,
  readWatcherState,
  releaseWatcherPid,
  removeStaleWatcherPid,
  writeWatcherPid,
} from './run-state-files';

/*
 * `watcher.pid` stamps (RUN-FORMAT section 14, baseline review critic major 1, AC 13): the file holds
 * `<pid> <bootTimeMs>`, is created with O_EXCL, and a reader decides liveness by boot, own-user
 * signal 0 and `selfPid`. Older bare-pid files are still read, dated by their mtime. Every run folder
 * is a fresh temp dir; the boot time is fixed through the options, and every liveness case that
 * needs a process other than this test runner stubs `process.kill`, so no other process is signalled.
 */

const BOOT_TIME_MS = Date.now() - 3_600_000;
const OTHER_BOOT_MS = BOOT_TIME_MS - 86_400_000;
/** A pid that is never signalled: tests that use it as a live owner stub `process.kill`. */
const OTHER_PID = 424_242;
const SELF_PID = 515_151;

let runDir: string;

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`stubbed ${code}`), { code });
}

function pidPath(): string {
  return join(runDir, 'watcher.pid');
}

beforeEach(async () => {
  runDir = await mkdtemp(join(tmpdir(), 'watcher-pid-'));
});

afterEach(async () => {
  mock.restoreAll();
  await rm(runDir, { recursive: true, force: true });
});

describe('claimWatcherPid', () => {
  it('creates the file once with the pid and boot stamp, and reports a second claim as taken', async () => {
    assert.equal(await claimWatcherPid(runDir, SELF_PID, BOOT_TIME_MS), 'claimed');
    assert.equal(await readFile(pidPath(), 'utf8'), `${SELF_PID} ${BOOT_TIME_MS}\n`);
    assert.equal(await claimWatcherPid(runDir, OTHER_PID, BOOT_TIME_MS), 'taken');
    assert.equal(await readFile(pidPath(), 'utf8'), `${SELF_PID} ${BOOT_TIME_MS}\n`);
  });

  it('writes the same stamp form through the atomic writer', async () => {
    await writeWatcherPid(runDir, OTHER_PID, BOOT_TIME_MS);
    assert.equal(await readFile(pidPath(), 'utf8'), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
  });
});

describe('readWatcherState with a stamp', () => {
  it('answers absent without a file', async () => {
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), { status: 'absent' });
  });

  it('answers alive for a live process of this user under the same boot', async () => {
    await writeFile(pidPath(), `${process.pid} ${BOOT_TIME_MS}\n`);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), { status: 'alive', pid: process.pid });
  });

  it('answers dead for its own pid: a watcher restarted with its old pid crash-resumes (AC 13)', async () => {
    const kill = mock.method(process, 'kill', () => true);
    await writeFile(pidPath(), `${SELF_PID} ${BOOT_TIME_MS}\n`);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), { status: 'dead', pid: SELF_PID });
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead for a stamp of another boot whose pid now belongs to a live process', async () => {
    const kill = mock.method(process, 'kill', () => true);
    await writeFile(pidPath(), `${OTHER_PID} ${OTHER_BOOT_MS}\n`);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), { status: 'dead', pid: OTHER_PID });
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead when the pid belongs to another user (EPERM no longer counts as alive)', async () => {
    mock.method(process, 'kill', () => {
      throw errorWithCode('EPERM');
    });
    await writeFile(pidPath(), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), { status: 'dead', pid: OTHER_PID });
  });

  it('refuses content that is not a pid stamp, and a link at the path', async () => {
    await writeFile(pidPath(), 'not a pid\n');
    await assert.rejects(readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), RunFileSchemaError);
    await rm(pidPath());
    await writeFile(join(runDir, 'elsewhere'), `${process.pid} ${BOOT_TIME_MS}\n`);
    await symlink(join(runDir, 'elsewhere'), pidPath());
    await assert.rejects(readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), RunFileSchemaError);
  });
});

describe('readWatcherState with an older bare-pid file', () => {
  it('answers alive when written during this boot and the pid is a live process of this user', async () => {
    await writeFile(pidPath(), `${process.pid}\n`);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), { status: 'alive', pid: process.pid });
  });

  it('answers dead when the file predates this boot, without signalling', async () => {
    const kill = mock.method(process, 'kill', () => true);
    await writeFile(pidPath(), `${OTHER_PID}\n`);
    const beforeBoot = new Date(BOOT_TIME_MS - BOOT_TIME_TOLERANCE_MS - 1000);
    await utimes(pidPath(), beforeBoot, beforeBoot);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), { status: 'dead', pid: OTHER_PID });
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead when signal 0 proves the pid gone (ESRCH) or foreign (EPERM)', async () => {
    await writeFile(pidPath(), `${OTHER_PID}\n`);
    for (const code of ['ESRCH', 'EPERM']) {
      mock.method(process, 'kill', () => {
        throw errorWithCode(code);
      });
      assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS }), { status: 'dead', pid: OTHER_PID }, code);
      mock.restoreAll();
    }
  });

  it('answers dead when it names the reading watcher itself', async () => {
    await writeFile(pidPath(), `${SELF_PID}\n`);
    assert.deepEqual(await readWatcherState(runDir, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), { status: 'dead', pid: SELF_PID });
  });

  it('still yields the pid through readWatcherPid, for both forms', async () => {
    await writeFile(pidPath(), `${OTHER_PID}\n`);
    assert.deepEqual(await readWatcherPid(runDir), { status: 'present', value: OTHER_PID });
    await writeFile(pidPath(), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
    assert.deepEqual(await readWatcherPid(runDir), { status: 'present', value: OTHER_PID });
  });
});

describe('removeStaleWatcherPid / releaseWatcherPid', () => {
  it('removes a stale file and then lets a new claim succeed', async () => {
    await writeFile(pidPath(), `${OTHER_PID} ${OTHER_BOOT_MS}\n`);
    assert.equal(await claimWatcherPid(runDir, SELF_PID, BOOT_TIME_MS), 'taken');
    assert.equal(await removeStaleWatcherPid(runDir, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), true);
    assert.equal(await claimWatcherPid(runDir, SELF_PID, BOOT_TIME_MS), 'claimed');
  });

  it('keeps the file of a live watcher', async () => {
    await writeFile(pidPath(), `${process.pid} ${BOOT_TIME_MS}\n`);
    assert.equal(await removeStaleWatcherPid(runDir, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), false);
    assert.equal(await readFile(pidPath(), 'utf8'), `${process.pid} ${BOOT_TIME_MS}\n`);
  });

  it('releases only a file that names the releasing pid', async () => {
    await writeFile(pidPath(), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
    assert.equal(await releaseWatcherPid(runDir, SELF_PID), 'not-owner');
    assert.equal(await readFile(pidPath(), 'utf8'), `${OTHER_PID} ${BOOT_TIME_MS}\n`);
    await writeFile(pidPath(), `${SELF_PID} ${BOOT_TIME_MS}\n`);
    assert.equal(await releaseWatcherPid(runDir, SELF_PID), 'removed');
    assert.equal(await releaseWatcherPid(runDir, SELF_PID), 'absent');
  });
});
