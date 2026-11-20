import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createTempDataHome, type TempDataHome } from '../test-support/temp-data-home';
import { MAX_PID_RECORD_BYTES, parseServicePidRecord, type ServiceName } from './pid-record';
import { readFastInputs } from './state-inputs';
import { deriveShellState, type ServiceStatus, type SlowInputs, type WatcherStatus } from './state-model';

/*
 * R3-AC-25.3: every heartbeat case (fresh, stale, future-dated, absent, invalid JSON, oversized)
 * against every pid record case (valid and alive, valid and dead, absent, invalid, oversized), read
 * from files in a temp data home and passed to the pure model with a fixed clock and fake liveness.
 */

const NOW_MS = Date.parse('2026-11-19T12:00:00.000Z');
const ALIVE_PID = 4242;
const DEAD_PID = 5353;
const FIXTURE = resolve(__dirname, 'fixtures', 'service-pid-record.json');
/** Over the shared heartbeat reader's 1 KiB bound (`MAX_HEARTBEAT_BYTES`, not exported). */
const HEARTBEAT_OVERSIZE_PADDING = 2048;
const slow: SlowInputs = {
  schedules: { status: 'ok', nextSlotAtMs: null, skipped: 0, truncated: false },
  reviews: { status: 'ok', count: 0, skipped: 0, truncated: false },
};

function heartbeat(atMs: number): string {
  return JSON.stringify({ format: 1, at: new Date(atMs).toISOString() });
}

const heartbeatCases: ReadonlyArray<{ name: string; content: string | null; expected: WatcherStatus }> = [
  { name: 'fresh', content: heartbeat(NOW_MS - 2_000), expected: 'alive' },
  { name: 'stale', content: heartbeat(NOW_MS - 11_000), expected: 'dead' },
  { name: 'future-dated', content: heartbeat(NOW_MS + 11_000), expected: 'dead' },
  { name: 'absent', content: null, expected: 'absent' },
  { name: 'invalid JSON', content: '{"format":1,', expected: 'dead' },
  // A fresh, otherwise valid heartbeat; trailing whitespace is legal JSON, so only the size bound refuses it.
  { name: 'oversized', content: `${heartbeat(NOW_MS - 2_000)}${' '.repeat(HEARTBEAT_OVERSIZE_PADDING)}`, expected: 'dead' },
];

function pidRecord(service: ServiceName, pid: number): string {
  return `${JSON.stringify({ service, pid, startedAt: '2026-11-19T11:00:00.000Z', entryPath: `/opt/studio/apps/${service}/dist/main.js`, port: service === 'api' ? 4311 : 4310 })}\n`;
}

const pidCases: ReadonlyArray<{ name: string; content: (service: ServiceName) => string | null; expected: ServiceStatus }> = [
  { name: 'valid and alive', content: (service) => pidRecord(service, ALIVE_PID), expected: 'running' },
  { name: 'valid and dead', content: (service) => pidRecord(service, DEAD_PID), expected: 'stopped' },
  { name: 'absent', content: () => null, expected: 'stopped' },
  { name: 'invalid', content: (service) => JSON.stringify({ service, pid: ALIVE_PID }), expected: 'unknown' },
  // A valid record of a live process; trailing whitespace is legal JSON, so only the size bound refuses it.
  { name: 'oversized', content: (service) => `${pidRecord(service, ALIVE_PID)}${' '.repeat(MAX_PID_RECORD_BYTES)}`, expected: 'unknown' },
];

const isProcessAlive = (pid: number): boolean => pid === ALIVE_PID;

async function place(home: TempDataHome, name: string, content: string | null): Promise<void> {
  const target = join(home.paths.logs, name);
  await rm(target, { force: true });
  if (content !== null) await home.write(join('logs', name), content);
}

describe('state model (R3-AC-25.3)', () => {
  let home: TempDataHome;

  before(async () => {
    home = await createTempDataHome();
  });

  after(async () => {
    await home.cleanup();
  });

  for (const heartbeatCase of heartbeatCases) {
    for (const pidCase of pidCases) {
      it(`heartbeat ${heartbeatCase.name}, pid records ${pidCase.name}`, async () => {
        await place(home, 'watcher.heartbeat.json', heartbeatCase.content);
        await place(home, 'api.pid.json', pidCase.content('api'));
        await place(home, 'web.pid.json', pidCase.content('web'));
        const state = deriveShellState(await readFastInputs(home.paths), slow, { nowMs: NOW_MS, isProcessAlive });
        assert.equal(state.watcher, heartbeatCase.expected);
        assert.equal(state.api, pidCase.expected);
        assert.equal(state.web, pidCase.expected);
      });
    }
  }

  it('a heartbeat exactly at the stale limit is still alive; one millisecond past it is dead', async () => {
    await place(home, 'watcher.heartbeat.json', heartbeat(NOW_MS - 10_000));
    assert.equal(deriveShellState(await readFastInputs(home.paths), slow, { nowMs: NOW_MS, isProcessAlive }).watcher, 'alive');
    assert.equal(deriveShellState(await readFastInputs(home.paths), slow, { nowMs: NOW_MS + 1, isProcessAlive }).watcher, 'dead');
  });

  it('a record naming the other service is invalid even when its process is alive', async () => {
    await place(home, 'api.pid.json', pidRecord('web', ALIVE_PID));
    await place(home, 'web.pid.json', pidRecord('web', ALIVE_PID));
    const state = deriveShellState(await readFastInputs(home.paths), slow, { nowMs: NOW_MS, isProcessAlive });
    assert.equal(state.api, 'unknown');
    // The same record under its own name is accepted, so the probe did answer alive.
    assert.equal(state.web, 'running');
  });

  it('a liveness error on a valid record reads unknown', async () => {
    await place(home, 'api.pid.json', pidRecord('api', ALIVE_PID));
    await place(home, 'web.pid.json', pidRecord('web', ALIVE_PID));
    const throwing = (): boolean => {
      throw new Error('probe failed');
    };
    const state = deriveShellState(await readFastInputs(home.paths), slow, { nowMs: NOW_MS, isProcessAlive: throwing });
    assert.equal(state.api, 'unknown');
    assert.equal(state.web, 'unknown');
  });
});

describe('pid record shape', () => {
  it('parses the fixture written in the shape of the CLI ServicePidRecordSchema', async () => {
    const parsed = parseServicePidRecord(await readFile(FIXTURE, 'utf8'), 'api');
    assert.deepEqual(parsed, {
      status: 'present',
      record: { service: 'api', pid: 4242, startedAt: '2026-11-19T12:00:00.000Z', entryPath: '/Users/owner/video-studio/apps/api/dist/main.js', port: 4311 },
    });
  });

  it('refuses an extra field, a relative entry path and a privileged port', () => {
    const base = { service: 'api', pid: 1, startedAt: '2026-11-19T12:00:00.000Z', entryPath: '/a/main.js', port: 4311 };
    assert.deepEqual(parseServicePidRecord(JSON.stringify({ ...base, extra: true }), 'api'), { status: 'invalid' });
    assert.deepEqual(parseServicePidRecord(JSON.stringify({ ...base, entryPath: 'a/main.js' }), 'api'), { status: 'invalid' });
    assert.deepEqual(parseServicePidRecord(JSON.stringify({ ...base, port: 80 }), 'api'), { status: 'invalid' });
  });
});
