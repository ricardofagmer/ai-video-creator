import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { currentBootTimeMs, readControlRequest, readRunFile, readWatcherPid, removeWatcherPid, writeWatcherPid } from '@studio/shared/run-files';
import { type RunId } from '@studio/shared/run-format';
import { type RunCandidate } from '../run-classification';
import {
  DAEMON_PID,
  captureLogs,
  loggedEvents,
  startDaemonWorld,
  type DaemonRound,
  type DaemonWorld,
  type LoggedLine,
} from './daemon-world.harness.test';

/*
 * Ticket 03 acceptance criterion 3 (CR3): the daemon picks up a run whose control.json carries
 * `resume: true` while no watcher is alive, and ignores it while one is alive (SPEC 0002 A6,
 * RUN-FORMAT 14, ADR 0003 single writer). The run is first held `paused` before any step by the
 * real engine; the owner's resume request is then written as the api would. The daemon and its
 * engine run as a stubbed pid (`stubProcessIdentity`, before `startMockEngine`), so this test
 * process's real pid is a live watcher of another process when `watcher.pid` names it. A dead
 * watcher is a stamp from an earlier boot, or one naming the daemon's own pid (an earlier life of
 * that pid). No process is started or signalled; liveness is read with signal 0 by the product.
 */

const PAUSE_AT = Date.parse('2026-11-21T12:00:00.000Z');
const RESUME_AT = PAUSE_AT + 60_000;
/** Far outside the 60 s same-boot tolerance of `isSameBoot`. */
const EARLIER_BOOT_OFFSET_MS = 24 * 60 * 60 * 1000;

let world: DaemonWorld | undefined;
let logs: LoggedLine[] = [];

beforeEach(async () => {
  logs = captureLogs();
  world = await startDaemonWorld({ asDaemonPid: DAEMON_PID });
});

afterEach(async () => {
  try {
    await world?.close();
  } finally {
    world = undefined;
    mock.restoreAll();
  }
});

function currentWorld(): DaemonWorld {
  if (world === undefined) return assert.fail('the daemon world did not start');
  return world;
}

/** The engine holds the run `paused` before any step (control.json `pause: true` at start); watcher.pid is released. */
async function pauseBeforeAnyStep(daemon: DaemonWorld): Promise<RunId> {
  await daemon.handle.writeControl({ pause: true, stop: false, at: PAUSE_AT });
  const paused = await daemon.handle.execute();
  assert.equal(paused.status, 'paused', 'precondition: the run was not held paused');
  assert.equal((await readWatcherPid(daemon.runDir)).status, 'absent', 'precondition: the engine left watcher.pid behind');
  return paused.runId;
}

/** What the api writes for the owner's "continue" while no watcher is alive (A6). */
async function requestResume(daemon: DaemonWorld): Promise<void> {
  await daemon.handle.writeControl({ pause: false, stop: false, resume: true, at: RESUME_AT });
}

function resumeCandidate(daemon: DaemonWorld, runId: RunId): RunCandidate {
  return { runId, runDir: daemon.runDir, trigger: 'owner-resume' };
}

/** Exactly one execution, of this run folder, that returned the run in `review`. */
function assertExecutedOnceToReview(round: DaemonRound, daemon: DaemonWorld, runId: RunId): void {
  assert.deepEqual(
    round.executions.map((execution) => execution.runDir),
    [daemon.runDir],
  );
  assert.deepEqual(round.executions[0]?.outcome, { status: 'returned', result: { runId, status: 'review' } });
}

describe('daemon pickup of a resume request (ticket 03 criterion 3)', () => {
  it('picks up a paused run with resume: true when no watcher.pid exists, and executes it once to review', async () => {
    const daemon = currentWorld();
    const runId = await pauseBeforeAnyStep(daemon);
    await requestResume(daemon);

    const round = await daemon.runDaemon({ scans: 2 });

    assert.deepEqual(round.scans, [[resumeCandidate(daemon, runId)], []], 'the run was not picked up once as an owner resume');
    assertExecutedOnceToReview(round, daemon, runId);
    assert.equal((await readRunFile(daemon.runDir)).state.status, 'review');
    assert.equal((await readControlRequest(daemon.runDir)).status, 'absent', 'the resume request was not consumed');
    assert.equal((await readWatcherPid(daemon.runDir)).status, 'absent', 'the engine kept watcher.pid after the execution');
  });

  it('picks it up when watcher.pid was stamped under an earlier boot', async () => {
    const daemon = currentWorld();
    const runId = await pauseBeforeAnyStep(daemon);
    await requestResume(daemon);
    await writeWatcherPid(daemon.runDir, daemon.livePid, currentBootTimeMs() - EARLIER_BOOT_OFFSET_MS);

    const round = await daemon.runDaemon({ scans: 2 });

    assert.deepEqual(round.scans, [[resumeCandidate(daemon, runId)], []]);
    assertExecutedOnceToReview(round, daemon, runId);
    assert.deepEqual(loggedEvents(logs, 'run.refused'), [], 'a stamp from an earlier boot was treated as a live owner');
  });

  it('picks it up when watcher.pid names the daemon’s own pid, left by an earlier life of that pid', async () => {
    const daemon = currentWorld();
    const runId = await pauseBeforeAnyStep(daemon);
    await requestResume(daemon);
    await writeWatcherPid(daemon.runDir, daemon.daemonPid);

    const round = await daemon.runDaemon({ scans: 2 });

    assert.deepEqual(round.scans, [[resumeCandidate(daemon, runId)], []]);
    assertExecutedOnceToReview(round, daemon, runId);
  });

  it('ignores it while watcher.pid names a live watcher of another process, leaving the run and its request untouched', async () => {
    const daemon = currentWorld();
    const runId = await pauseBeforeAnyStep(daemon);
    await requestResume(daemon);
    await writeWatcherPid(daemon.runDir, daemon.livePid);

    const round = await daemon.runDaemon({ scans: 1 });

    assert.deepEqual(round.scans, [[]], 'a run owned by a live watcher was offered to the engine');
    assert.deepEqual(round.executions, []);
    assert.equal((await readRunFile(daemon.runDir)).state.status, 'paused');
    const control = await readControlRequest(daemon.runDir);
    assert.ok(control.status === 'present' && control.value.resume === true, 'the resume request did not survive for the live owner');
    assert.deepEqual(await readWatcherPid(daemon.runDir), { status: 'present', value: daemon.livePid }, 'the live owner’s watcher.pid was touched');
    assert.deepEqual(loggedEvents(logs, 'run.refused'), [
      { level: 'warn', fields: { event: 'run.refused', reason: 'live-owner', runId, ownerPid: daemon.livePid } },
    ]);
  });

  it('picks it up on a later scan once the live watcher has gone', async () => {
    const daemon = currentWorld();
    const runId = await pauseBeforeAnyStep(daemon);
    await requestResume(daemon);
    await writeWatcherPid(daemon.runDir, daemon.livePid);

    // One loop: the first scan sees the live owner; the owner exits (its file goes) before the
    // second scan. The idle wait between them is one real poll interval (RUN_SCAN_INTERVAL_MS).
    const round = await daemon.runDaemon({
      scans: 3,
      beforeScan: async (scanIndex) => {
        if (scanIndex === 1) await removeWatcherPid(daemon.runDir);
      },
    });

    assert.deepEqual(round.scans, [[], [resumeCandidate(daemon, runId)], []]);
    assertExecutedOnceToReview(round, daemon, runId);
    assert.equal(loggedEvents(logs, 'run.refused').length, 1, 'the refusal was not logged exactly once');
  });

  it('leaves a paused run alone when control.json carries no resume request', async () => {
    const daemon = currentWorld();
    await pauseBeforeAnyStep(daemon);

    const round = await daemon.runDaemon({ scans: 1 });

    assert.deepEqual(round.scans, [[]]);
    assert.deepEqual(round.executions, []);
    assert.equal((await readRunFile(daemon.runDir)).state.status, 'paused');
  });
});
