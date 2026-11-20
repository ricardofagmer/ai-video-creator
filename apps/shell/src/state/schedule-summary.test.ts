import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ScheduleFileSchema, nextSlots, type Recurrence, type ScheduleStatus } from '@studio/shared/schedules';
import { createTempDataHome, type TempDataHome } from '../test-support/temp-data-home';
import { MAX_SCHEDULE_FILE_BYTES, readScheduleSummary } from './schedule-summary';

/*
 * R3-AC-25.4 (next schedule): the earliest `nextSlots` result over `active` schedules; `paused` and
 * `deleted` are ignored; an unreadable schedule is skipped and counted; no active schedule is none.
 * Now is Thursday 2026-11-19 12:00 in America/Sao_Paulo (UTC-3 all year).
 */

const NOW_MS = Date.parse('2026-11-19T15:00:00.000Z');
const TIMEZONE = 'America/Sao_Paulo';
const IDS = {
  daily: '01JD2Q7F3M8V5K9X4T6R2N0B1A',
  weekly: '01JD2Q7F3M8V5K9X4T6R2N0B1B',
  paused: '01JD2Q7F3M8V5K9X4T6R2N0B1C',
  deleted: '01JD2Q7F3M8V5K9X4T6R2N0B1D',
  broken: '01JD2Q7F3M8V5K9X4T6R2N0B1E',
  fifo: '01JD2Q7F3M8V5K9X4T6R2N0B1F',
  oversized: '01JD2Q7F3M8V5K9X4T6R2N0B1G',
  linked: '01JD2Q7F3M8V5K9X4T6R2N0B1H',
} as const;
/** A FIFO with no writer would block a plain read forever; the scan must finish well inside this. */
const NO_HANG_TIMEOUT_MS = 5_000;

function scheduleFile(scheduleId: string, status: ScheduleStatus, recurrence: Recurrence): string {
  const file = ScheduleFileSchema.parse({
    format: 1,
    scheduleId,
    title: 'Agenda de teste',
    status,
    statusSince: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    createdBy: 'cli',
    correlationId: null,
    recipeRef: 'product-tour-16x9@1',
    recurrence,
    timezone: TIMEZONE,
    briefMode: 'queue',
    briefs: [
      {
        briefId: '01JD2Q7F3M8V5K9X4T6R2N0B2A',
        brief: { topic: 'Tour do app', keyMessages: [], format: '16:9', language: 'pt-BR', targetDurationSec: 60 },
        references: [],
      },
    ],
    costConsent: { perRunUsd: 1, acceptedAt: '2026-11-01T00:00:00.000Z' },
  });
  return JSON.stringify(file);
}

const daily: Recurrence = { kind: 'daily', time: '09:00' };
const weekly: Recurrence = { kind: 'weekly', weekdays: [1], time: '08:00' };
/** Earlier than both active ones, so a model that read them would pick them. */
const earlier: Recurrence = { kind: 'daily', time: '07:00' };

describe('next schedule (R3-AC-25.4)', () => {
  let home: TempDataHome;

  beforeEach(async () => {
    home = await createTempDataHome();
  });

  afterEach(async () => {
    await home.cleanup();
  });

  async function writeSchedule(scheduleId: string, content: string): Promise<void> {
    await home.write(join('schedules', scheduleId, 'schedule.json'), content);
  }

  it('returns the earliest next slot over active schedules and ignores paused and deleted ones', async () => {
    await writeSchedule(IDS.daily, scheduleFile(IDS.daily, 'active', daily));
    await writeSchedule(IDS.weekly, scheduleFile(IDS.weekly, 'active', weekly));
    await writeSchedule(IDS.paused, scheduleFile(IDS.paused, 'paused', earlier));
    await writeSchedule(IDS.deleted, scheduleFile(IDS.deleted, 'deleted', earlier));
    const summary = await readScheduleSummary(home.paths.schedules, NOW_MS);
    const after = new Date(NOW_MS);
    const expected = Math.min(
      ...[daily, weekly].map((recurrence) => nextSlots({ recurrence, timezone: TIMEZONE, after, count: 1 })[0]?.getTime() ?? Number.POSITIVE_INFINITY),
    );
    assert.equal(expected, Date.parse('2026-11-20T12:00:00.000Z'));
    assert.deepEqual(summary, { status: 'ok', nextSlotAtMs: expected, skipped: 0, truncated: false });
  });

  it('skips and counts an unreadable schedule, still using the readable ones', async () => {
    await writeSchedule(IDS.weekly, scheduleFile(IDS.weekly, 'active', weekly));
    await writeSchedule(IDS.broken, '{"format":1,"scheduleId":');
    const summary = await readScheduleSummary(home.paths.schedules, NOW_MS);
    assert.deepEqual(summary, { status: 'ok', nextSlotAtMs: Date.parse('2026-11-23T11:00:00.000Z'), skipped: 1, truncated: false });
  });

  it(
    'skips and counts a FIFO and an oversized schedule without hanging (LOW-1)',
    { timeout: NO_HANG_TIMEOUT_MS, skip: process.platform === 'win32' ? 'mkfifo is POSIX only' : false },
    async () => {
      await writeSchedule(IDS.weekly, scheduleFile(IDS.weekly, 'active', weekly));
      const fifoFolder = join(home.paths.schedules, IDS.fifo);
      await mkdir(fifoFolder, { recursive: true });
      execFileSync('mkfifo', [join(fifoFolder, 'schedule.json')]);
      // Valid and active with an earlier slot; trailing whitespace is legal JSON, so only the size cap refuses it.
      await writeSchedule(IDS.oversized, `${scheduleFile(IDS.oversized, 'active', earlier)}${' '.repeat(MAX_SCHEDULE_FILE_BYTES)}`);
      const summary = await readScheduleSummary(home.paths.schedules, NOW_MS);
      assert.deepEqual(summary, { status: 'ok', nextSlotAtMs: Date.parse('2026-11-23T11:00:00.000Z'), skipped: 2, truncated: false });
    },
  );

  it('skips and counts a schedule file that is a symbolic link', async () => {
    await writeSchedule(IDS.weekly, scheduleFile(IDS.weekly, 'active', weekly));
    // The link target is a valid active schedule with an earlier slot, so following the link would pick it.
    const target = join(home.root, 'outside-schedule.json');
    await writeFile(target, scheduleFile(IDS.linked, 'active', earlier), 'utf8');
    const linkedFolder = join(home.paths.schedules, IDS.linked);
    await mkdir(linkedFolder, { recursive: true });
    await symlink(target, join(linkedFolder, 'schedule.json'));
    const summary = await readScheduleSummary(home.paths.schedules, NOW_MS);
    assert.deepEqual(summary, { status: 'ok', nextSlotAtMs: Date.parse('2026-11-23T11:00:00.000Z'), skipped: 1, truncated: false });
  });

  it('yields none when no schedule is active', async () => {
    await writeSchedule(IDS.paused, scheduleFile(IDS.paused, 'paused', daily));
    await writeSchedule(IDS.deleted, scheduleFile(IDS.deleted, 'deleted', weekly));
    assert.deepEqual(await readScheduleSummary(home.paths.schedules, NOW_MS), { status: 'ok', nextSlotAtMs: null, skipped: 0, truncated: false });
  });

  it('yields none when the schedules folder holds nothing', async () => {
    assert.deepEqual(await readScheduleSummary(home.paths.schedules, NOW_MS), { status: 'ok', nextSlotAtMs: null, skipped: 0, truncated: false });
  });
});
