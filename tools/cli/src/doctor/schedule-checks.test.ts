import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scheduleChecks, type ScheduleScan } from './schedule-checks.js';

/* SPEC 0006 section 5.7: the `studio doctor` schedule checks, over an in-memory scan. */

const ACTIVE = '01JDA5Z8Q6M0N9Y7X4W3V2T1S1';
const PAUSED = '01JDA5Z8Q6M0N9Y7X4W3V2T1S2';
const RUN_ID = '01JDA60000000000000000RNN1';

function scan(overrides: Partial<ScheduleScan> = {}): ScheduleScan {
  return {
    schedules: [
      { scheduleId: ACTIVE, status: 'active' },
      { scheduleId: PAUSED, status: 'paused' },
    ],
    unreadable: [],
    missingFiredRuns: [],
    ...overrides,
  };
}

describe('doctor: schedule checks', () => {
  it('is ok when files read, fired runs exist and the watcher runs', () => {
    const result = scheduleChecks(scan(), true);
    assert.equal(result.check.status, 'ok');
    assert.match(result.check.detail, /1 ativo\(s\), 1 pausado\(s\)/);
    assert.deepEqual(result.lines, []);
  });

  it('warns when schedules are active and the watcher is not running', () => {
    const result = scheduleChecks(scan(), false);
    assert.equal(result.check.status, 'warning');
    assert.match(result.check.detail, /watcher não está rodando/);
  });

  it('does not warn about the watcher when nothing is active', () => {
    const result = scheduleChecks(scan({ schedules: [{ scheduleId: PAUSED, status: 'paused' }] }), false);
    assert.equal(result.check.status, 'ok');
  });

  it('warns for a fired run without a folder and lists it by id', () => {
    const result = scheduleChecks(scan({ missingFiredRuns: [{ scheduleId: ACTIVE, runId: RUN_ID }] }), true);
    assert.equal(result.check.status, 'warning');
    assert.deepEqual(result.lines, [`        ${ACTIVE}: execução disparada ${RUN_ID} sem pasta`]);
  });

  it('fails when a schedule file does not parse', () => {
    const result = scheduleChecks(scan({ unreadable: [{ scheduleId: PAUSED, file: 'schedule' }] }), true);
    assert.equal(result.check.status, 'failed');
    assert.deepEqual(result.lines, [`        ${PAUSED}: agendamento ilegível`]);
  });
});
