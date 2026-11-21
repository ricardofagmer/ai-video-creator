import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type WatcherState } from '@studio/shared/run-files';
import { classifyRun, type RunFacts } from './run-classification';

/*
 * Crash-resume on a reused pid (baseline review critic major 1, AC 13): the scanner reads
 * watcher.pid with this daemon's pid as `selfPid`, so a file naming the daemon itself (an earlier
 * life of that pid) answers `dead` and a `running` run crash-resumes; only `alive` means another
 * watcher owns the run. Pure function: no files, no processes.
 */

const RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const SINCE = '2026-11-21T10:00:00.000Z';

function runningFacts(owner: WatcherState): RunFacts {
  return {
    run: { runId: RUN_ID, state: { status: 'running', since: SINCE, pid: 4242 } },
    owner,
    resumeRequested: false,
    approval: { status: 'absent' },
  };
}

describe('classifyRun ownership', () => {
  it('crash-resumes a running run whose recorded watcher is dead, including a reused own pid', () => {
    assert.deepEqual(classifyRun(runningFacts({ status: 'dead', pid: 4242 })), { kind: 'start', trigger: 'crash-resume' });
  });

  it('crash-resumes a running run with no watcher.pid', () => {
    assert.deepEqual(classifyRun(runningFacts({ status: 'absent' })), { kind: 'start', trigger: 'crash-resume' });
  });

  it('refuses a run another live watcher owns', () => {
    assert.deepEqual(classifyRun(runningFacts({ status: 'alive', pid: 777 })), { kind: 'owned', ownerPid: 777 });
  });

  it('starts a pending run once its owner is dead', () => {
    const facts: RunFacts = { ...runningFacts({ status: 'dead', pid: 4242 }), run: { runId: RUN_ID, state: { status: 'pending', since: SINCE } } };
    assert.deepEqual(classifyRun(facts), { kind: 'start', trigger: 'pending' });
  });
});
