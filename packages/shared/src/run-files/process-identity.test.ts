import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  BOOT_TIME_TOLERANCE_MS,
  currentBootTimeMs,
  formatProcessStamp,
  isOwnProcessAlive,
  isPidAliveSince,
  isSameBoot,
  isStampAlive,
  parseProcessStamp,
} from './process-identity';

/*
 * Process identity (SPEC 0007 section 5.5, review finding C1): a recorded owner is alive only under
 * the same boot, as a live process of this user, and never as the reader's own pid. `process.kill`
 * is replaced by a stub in every liveness test, so no signal ever reaches a real process.
 */

const BOOT_TIME_MS = 1_763_600_000_000;
/** Never signalled: every test that uses it stubs `process.kill` first. */
const OWNER_PID = 424_242;
const SELF_PID = 515_151;

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`stubbed ${code}`), { code });
}

/** Replaces `process.kill` with `behaviour` and returns the mock, so a test can count calls. */
function stubKill(behaviour: () => true) {
  return mock.method(process, 'kill', behaviour);
}

afterEach(() => {
  mock.restoreAll();
});

describe('parseProcessStamp / formatProcessStamp', () => {
  it('parses an older claim holding only a pid, with no boot time', () => {
    assert.deepEqual(parseProcessStamp('1234\n'), { pid: 1234, bootTimeMs: null });
  });

  it('parses a new stamp holding the pid and the boot time', () => {
    assert.deepEqual(parseProcessStamp(`1234 ${BOOT_TIME_MS}\n`), { pid: 1234, bootTimeMs: BOOT_TIME_MS });
  });

  it('round-trips a formatted stamp', () => {
    const text = formatProcessStamp(1234, BOOT_TIME_MS);
    assert.equal(text, `1234 ${BOOT_TIME_MS}\n`);
    assert.deepEqual(parseProcessStamp(text), { pid: 1234, bootTimeMs: BOOT_TIME_MS });
  });

  it('formats the current boot time when none is given', () => {
    const parsed = parseProcessStamp(formatProcessStamp(1234));
    assert.ok(parsed !== null);
    assert.equal(isSameBoot(parsed.bootTimeMs), true);
  });

  it('refuses anything that is not a pid with an optional boot time', () => {
    for (const text of ['', 'abc', '0', '-1', '12345678', '1234 12', `1234 ${BOOT_TIME_MS} extra`, `1234  ${BOOT_TIME_MS}`, '1234 abc']) {
      assert.equal(parseProcessStamp(text), null, JSON.stringify(text));
    }
  });
});

describe('currentBootTimeMs / isSameBoot', () => {
  it('rounds the boot time to the second', () => {
    assert.equal(currentBootTimeMs() % 1000, 0);
  });

  it('treats a boot time inside the tolerance as this boot and one beyond it as another boot', () => {
    assert.equal(isSameBoot(BOOT_TIME_MS, BOOT_TIME_MS), true);
    assert.equal(isSameBoot(BOOT_TIME_MS + BOOT_TIME_TOLERANCE_MS, BOOT_TIME_MS), true);
    assert.equal(isSameBoot(BOOT_TIME_MS - BOOT_TIME_TOLERANCE_MS - 1, BOOT_TIME_MS), false);
    assert.equal(isSameBoot(BOOT_TIME_MS + BOOT_TIME_TOLERANCE_MS + 1, BOOT_TIME_MS), false);
  });

  it('never treats a stamp without a boot time as this boot', () => {
    assert.equal(isSameBoot(null, BOOT_TIME_MS), false);
  });
});

describe('isOwnProcessAlive', () => {
  it('answers alive when signal 0 succeeds, without sending any other signal', () => {
    const kill = stubKill(() => true);
    assert.equal(isOwnProcessAlive(OWNER_PID), true);
    assert.deepEqual(kill.mock.calls[0]?.arguments, [OWNER_PID, 0]);
  });

  it('answers dead for ESRCH', () => {
    stubKill(() => {
      throw errorWithCode('ESRCH');
    });
    assert.equal(isOwnProcessAlive(OWNER_PID), false);
  });

  it('answers dead for EPERM: a process of another user is not the owner', () => {
    stubKill(() => {
      throw errorWithCode('EPERM');
    });
    assert.equal(isOwnProcessAlive(OWNER_PID), false);
  });

  it('rethrows any other failure instead of guessing', () => {
    stubKill(() => {
      throw errorWithCode('EINVAL');
    });
    assert.throws(() => isOwnProcessAlive(OWNER_PID), { code: 'EINVAL' });
  });
});

describe('isStampAlive', () => {
  it('answers alive for a live owner under the same boot', () => {
    stubKill(() => true);
    assert.equal(isStampAlive({ pid: OWNER_PID, bootTimeMs: BOOT_TIME_MS }, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), true);
  });

  it('answers dead for an owner recorded under another boot, without signalling its pid', () => {
    const kill = stubKill(() => true);
    const otherBoot = BOOT_TIME_MS - 3_600_000;
    assert.equal(isStampAlive({ pid: OWNER_PID, bootTimeMs: otherBoot }, { bootTimeMs: BOOT_TIME_MS }), false);
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead for an older stamp without a boot time, even when its pid answers', () => {
    stubKill(() => true);
    assert.equal(isStampAlive({ pid: OWNER_PID, bootTimeMs: null }, { bootTimeMs: BOOT_TIME_MS }), false);
  });

  it('answers dead for an owner that runs as another user (EPERM)', () => {
    stubKill(() => {
      throw errorWithCode('EPERM');
    });
    assert.equal(isStampAlive({ pid: OWNER_PID, bootTimeMs: BOOT_TIME_MS }, { bootTimeMs: BOOT_TIME_MS }), false);
  });

  it('answers dead when the stamp names the reader itself, without signalling', () => {
    const kill = stubKill(() => true);
    assert.equal(isStampAlive({ pid: SELF_PID, bootTimeMs: BOOT_TIME_MS }, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), false);
    assert.equal(kill.mock.callCount(), 0);
  });
});

describe('isPidAliveSince (a bare pid dated by when it was recorded)', () => {
  it('answers alive for a live owner recorded during this boot', () => {
    stubKill(() => true);
    assert.equal(isPidAliveSince(OWNER_PID, BOOT_TIME_MS + 5_000, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), true);
  });

  it('answers dead for a record from before this boot, without signalling its pid', () => {
    const kill = stubKill(() => true);
    assert.equal(isPidAliveSince(OWNER_PID, BOOT_TIME_MS - BOOT_TIME_TOLERANCE_MS - 1, { bootTimeMs: BOOT_TIME_MS }), false);
    assert.equal(kill.mock.callCount(), 0);
  });

  it('answers dead for the reader itself, an unparseable instant, or a pid of another user', () => {
    const kill = stubKill(() => true);
    assert.equal(isPidAliveSince(SELF_PID, BOOT_TIME_MS + 5_000, { bootTimeMs: BOOT_TIME_MS, selfPid: SELF_PID }), false);
    assert.equal(isPidAliveSince(OWNER_PID, Number.NaN, { bootTimeMs: BOOT_TIME_MS }), false);
    assert.equal(kill.mock.callCount(), 0);
    mock.restoreAll();
    stubKill(() => {
      throw errorWithCode('EPERM');
    });
    assert.equal(isPidAliveSince(OWNER_PID, BOOT_TIME_MS + 5_000, { bootTimeMs: BOOT_TIME_MS }), false);
  });
});
