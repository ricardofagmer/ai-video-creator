import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { isCurationClaimantAlive } from './curation-claimant';

/*
 * Single watcher (baseline review): the start sweep fails a `collecting` curation only when its
 * claimant is gone. A claim is a bare pid and an instant, so a claim from before this boot, one
 * naming the sweeping process, or a pid that signal 0 proves gone (ESRCH) or foreign (EPERM) is not
 * alive. Every case that needs another process stubs `process.kill`; nothing is signalled.
 */

const BOOT_TIME_MS = Date.parse('2026-11-21T08:00:00.000Z');
const SELF_PID = 515_151;
const OTHER_PID = 424_242;

function claimedAt(iso: string, pid = OTHER_PID) {
  return { claim: { pid, claimedAt: iso } };
}

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`stubbed ${code}`), { code });
}

afterEach(() => {
  mock.restoreAll();
});

describe('isCurationClaimantAlive', () => {
  it('answers alive for a claim of this boot by a live process of this user', () => {
    const kill = mock.method(process, 'kill', () => true);
    assert.equal(isCurationClaimantAlive(claimedAt('2026-11-21T09:00:00.000Z'), { selfPid: SELF_PID, bootTimeMs: BOOT_TIME_MS }), true);
    assert.equal(kill.mock.callCount(), 1);
  });

  it('answers not alive for a claim from before this boot, without signalling', () => {
    const kill = mock.method(process, 'kill', () => true);
    assert.equal(isCurationClaimantAlive(claimedAt('2026-11-20T09:00:00.000Z'), { selfPid: SELF_PID, bootTimeMs: BOOT_TIME_MS }), false);
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers not alive for a claim naming the sweeping process itself', () => {
    assert.equal(isCurationClaimantAlive(claimedAt('2026-11-21T09:00:00.000Z', SELF_PID), { selfPid: SELF_PID, bootTimeMs: BOOT_TIME_MS }), false);
  });

  it('answers not alive when signal 0 says ESRCH or EPERM', () => {
    for (const code of ['ESRCH', 'EPERM']) {
      mock.method(process, 'kill', () => {
        throw errorWithCode(code);
      });
      assert.equal(isCurationClaimantAlive(claimedAt('2026-11-21T09:00:00.000Z'), { selfPid: SELF_PID, bootTimeMs: BOOT_TIME_MS }), false, code);
      mock.restoreAll();
    }
  });

  it('answers not alive for a curation without a claim', () => {
    assert.equal(isCurationClaimantAlive({}, { selfPid: SELF_PID, bootTimeMs: BOOT_TIME_MS }), false);
  });
});
