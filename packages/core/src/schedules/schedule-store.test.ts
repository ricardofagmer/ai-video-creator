import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger } from '@nestjs/common';
import { DataHome } from '../paths/data-home';
import { ScheduleStore } from './schedule-store';

/*
 * `ScheduleStore.listAll` logs a corrupt `schedule.json` when it turns unreadable, not on every
 * call: the watcher lists every idle second (hardening note after run 2). The data home is an
 * `fs.mkdtemp` folder; no SQLite, no network.
 */

const SCHEDULE_ID = '01JD00000000000000000000AA';

let root: string;
let dataHome: DataHome;

async function writeCorruptSchedule(): Promise<void> {
  const folder = join(dataHome.schedules, SCHEDULE_ID);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'schedule.json'), '{ not json');
}

/** The slice of a node:test mock this test reads; structural, so no cast is needed. */
interface RecordedCalls {
  mock: { calls: readonly { arguments: readonly unknown[] }[] };
}

function unreadableWarnings(warn: RecordedCalls): number {
  return warn.mock.calls.filter((call) => {
    const [entry] = call.arguments;
    return typeof entry === 'object' && entry !== null && 'event' in entry && entry.event === 'schedule.list-unreadable';
  }).length;
}

describe('ScheduleStore.listAll unreadable log', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-core-schedule-store-'));
    dataHome = new DataHome(root);
    await mkdir(dataHome.schedules, { recursive: true });
  });

  afterEach(async () => {
    mock.restoreAll();
    await rm(root, { recursive: true, force: true });
  });

  it('lists a corrupt schedule as unreadable on every call but logs it once', async () => {
    const warn = mock.method(Logger.prototype, 'warn', () => undefined);
    await writeCorruptSchedule();
    const store = new ScheduleStore(dataHome);

    for (let call = 0; call < 3; call += 1) {
      assert.deepEqual(await store.listAll(), [{ scheduleId: SCHEDULE_ID, state: 'unreadable' }]);
    }
    assert.equal(unreadableWarnings(warn), 1);
  });

  it('logs again when the schedule turns unreadable after it was gone', async () => {
    const warn = mock.method(Logger.prototype, 'warn', () => undefined);
    await writeCorruptSchedule();
    const store = new ScheduleStore(dataHome);
    await store.listAll();

    await rm(join(dataHome.schedules, SCHEDULE_ID, 'schedule.json'));
    assert.deepEqual(await store.listAll(), []);

    await writeCorruptSchedule();
    await store.listAll();
    assert.equal(unreadableWarnings(warn), 2);
  });
});
