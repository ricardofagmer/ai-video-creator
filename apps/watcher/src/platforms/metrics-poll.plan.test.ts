import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type MetricResult, type MetricTarget } from '@studio/core/platforms';
import { newUlid } from '@studio/shared/run-files';
import { applyResults, nextBackoff, planPass, type CursorEntries } from './metrics-poll.plan';
import { type PollTargetRow } from './publication-targets.reader';
import { sampleMetrics } from './platform-fixtures.harness.test';

/*
 * The pure parts of the metrics poll (SPEC 0007 sections 5.5 and 5.7, OD3, AC 53, AC 56): the
 * pass plan over `pollDue`, the strike rule and the backoff ladder. No clock, file or call.
 */

const TODAY = '2026-11-20';
const NOW = new Date('2026-11-20T15:00:00.000Z');
const HOUR_MS = 3_600_000;

function dayBefore(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

let sequence = 0;

function row(options: { daysAgo: number; platform?: PollTargetRow['platform']; origin?: string }): PollTargetRow {
  sequence += 1;
  return {
    publicationId: newUlid(NOW.getTime() - sequence),
    platform: options.platform ?? 'youtube',
    platformVideoId: `video${String(sequence).padStart(6, '0')}`,
    publishedOn: dayBefore(TODAY, options.daysAgo),
    recordedAt: NOW,
    origin: options.origin ?? 'manual',
    platformMediaId: null,
  };
}

function polledOn(lastPolledOn: string | null): CursorEntries[string] {
  return { lastPolledOn, stopped: null, strikes: 0, platformMediaId: null };
}

describe('planPass (AC 53)', () => {
  it('takes at most 50 due publications per pass, never-polled first', () => {
    const polled = Array.from({ length: 10 }, () => row({ daysAgo: 10 }));
    const fresh = Array.from({ length: 45 }, () => row({ daysAgo: 5 }));
    const entries: CursorEntries = Object.fromEntries(polled.map((item) => [item.publicationId, polledOn(dayBefore(TODAY, 1))]));

    const plan = planPass({ platform: 'youtube', mode: 'live', rows: [...polled, ...fresh], entries, today: TODAY });

    assert.equal(plan.due, 55);
    assert.equal(plan.targets.length, 50);
    const asked = new Set(plan.targets.map((target) => target.publicationId));
    for (const item of fresh) assert.ok(asked.has(item.publicationId), 'every never-polled publication is asked first');
  });

  it('follows pollDue: daily to day 30, weekly to day 180, stopped window-closed after', () => {
    const polledToday = row({ daysAgo: 3 });
    const weeklyNotDue = row({ daysAgo: 37 });
    const weeklyDue = row({ daysAgo: 38 });
    const closed = row({ daysAgo: 181 });
    const entries: CursorEntries = {
      [polledToday.publicationId]: polledOn(TODAY),
      [weeklyNotDue.publicationId]: polledOn(dayBefore(TODAY, 6)),
      [weeklyDue.publicationId]: polledOn(dayBefore(TODAY, 7)),
    };

    const plan = planPass({ platform: 'youtube', mode: 'live', rows: [polledToday, weeklyNotDue, weeklyDue, closed], entries, today: TODAY });

    assert.deepEqual(plan.targets.map((target) => [target.publicationId, target.dayIndex]), [[weeklyDue.publicationId, 38]]);
    assert.equal(plan.stopped, 1);
    assert.equal(plan.entries[closed.publicationId]?.stopped, 'window-closed');
  });

  it('skips stopped entries, other platforms, and in live mode publications of origin mock', () => {
    const stopped = row({ daysAgo: 2 });
    const tiktok = row({ daysAgo: 2, platform: 'tiktok' });
    const mockOrigin = row({ daysAgo: 2, origin: 'mock' });
    const entries: CursorEntries = { [stopped.publicationId]: { lastPolledOn: null, stopped: 'not-found', strikes: 3, platformMediaId: null } };

    const live = planPass({ platform: 'youtube', mode: 'live', rows: [stopped, tiktok, mockOrigin], entries, today: TODAY });
    const mock = planPass({ platform: 'youtube', mode: 'mock', rows: [stopped, tiktok, mockOrigin], entries, today: TODAY });

    assert.deepEqual(live.targets, []);
    assert.deepEqual(mock.targets.map((target) => target.publicationId), [mockOrigin.publicationId]);
  });

  it('skips a row whose stored date is not a calendar day instead of guessing', () => {
    const broken: PollTargetRow = { ...row({ daysAgo: 2 }), publishedOn: '2026-02-30' };

    assert.deepEqual(planPass({ platform: 'youtube', mode: 'live', rows: [broken], entries: {}, today: TODAY }).targets, []);
  });

  it('polls manual and studio publications in live mode, and only mock publications in mock mode (C11)', () => {
    const manual = row({ daysAgo: 2, origin: 'manual' });
    const studio = row({ daysAgo: 2, origin: 'studio' });
    const mockOrigin = row({ daysAgo: 2, origin: 'mock' });
    const rows = [manual, studio, mockOrigin];

    const live = planPass({ platform: 'youtube', mode: 'live', rows, entries: {}, today: TODAY });
    const mock = planPass({ platform: 'youtube', mode: 'mock', rows, entries: {}, today: TODAY });

    assert.deepEqual(live.targets.map((target) => target.publicationId).sort(), [manual.publicationId, studio.publicationId].sort());
    assert.deepEqual(mock.targets.map((target) => target.publicationId), [mockOrigin.publicationId]);
    assert.equal(mock.due, 1, 'a manual or studio publication is not even due in mock mode');
    assert.equal(mock.entries[manual.publicationId], undefined);
  });
});

describe('applyResults: strikes (AC 53)', () => {
  const target: MetricTarget = { publicationId: newUlid(NOW.getTime()), platformVideoId: 'abcdefghijk', platformMediaId: null, dayIndex: 4 };
  const notFound: MetricResult = { publicationId: target.publicationId, status: 'not-found' };

  it('stops a publication after three strikes on three days', () => {
    let entries: CursorEntries = {};
    for (const day of [dayBefore(TODAY, 2), dayBefore(TODAY, 1)]) {
      const applied = applyResults({ targets: [target], results: [notFound], entries, today: day });
      assert.equal(applied.stopped, 0);
      entries = applied.entries;
    }

    const third = applyResults({ targets: [target], results: [notFound], entries, today: TODAY });

    assert.equal(third.stopped, 1);
    assert.deepEqual(third.entries[target.publicationId], { lastPolledOn: TODAY, stopped: 'not-found', strikes: 3, platformMediaId: null });
    assert.deepEqual(third.rows, []);
  });

  it('counts at most one strike per local day', () => {
    const first = applyResults({ targets: [target], results: [notFound], entries: {}, today: TODAY });
    const again = applyResults({ targets: [target], results: [notFound], entries: first.entries, today: TODAY });

    assert.equal(again.entries[target.publicationId]?.strikes, 1);
  });

  it('records an ok answer as polled today, clears strikes and yields one batch row', () => {
    const entries: CursorEntries = { [target.publicationId]: { lastPolledOn: dayBefore(TODAY, 1), stopped: null, strikes: 2, platformMediaId: null } };
    const ok: MetricResult = { publicationId: target.publicationId, status: 'ok', metrics: sampleMetrics(10), platformMediaId: '1789' };

    const applied = applyResults({ targets: [target], results: [ok], entries, today: TODAY });

    assert.deepEqual(applied.rows, [{ publicationId: target.publicationId, metrics: sampleMetrics(10) }]);
    assert.deepEqual(applied.entries[target.publicationId], { lastPolledOn: TODAY, stopped: null, strikes: 0, platformMediaId: '1789' });
  });

  it('ignores answers for ids that were not asked and repeated answers (K10)', () => {
    const stranger: MetricResult = { publicationId: newUlid(NOW.getTime() + 1), status: 'ok', metrics: sampleMetrics(1), platformMediaId: null };
    const ok: MetricResult = { publicationId: target.publicationId, status: 'ok', metrics: sampleMetrics(5), platformMediaId: '../escape' };

    const applied = applyResults({ targets: [target], results: [stranger, ok, ok], entries: {}, today: TODAY });

    assert.equal(applied.polled, 1);
    assert.equal(applied.rows.length, 1);
    assert.equal(applied.entries[target.publicationId]?.platformMediaId, null, 'a media id that is not a plain id is not kept');
  });
});

describe('nextBackoff (AC 56, section 5.7)', () => {
  it('waits 1, 2, 4, 8, then 24 hours by consecutive failed passes', () => {
    let previous: ReturnType<typeof nextBackoff> | null = null;
    const waits: number[] = [];
    for (let pass = 0; pass < 6; pass += 1) {
      previous = nextBackoff({ platform: 'tiktok', previous, reasonId: 'rate-limited', retryAfterSeconds: null, now: NOW });
      waits.push((Date.parse(previous.until) - NOW.getTime()) / HOUR_MS);
    }

    assert.deepEqual(waits, [1, 2, 4, 8, 24, 24]);
    assert.equal(previous?.level, 5);
  });

  it('waits until the next midnight Pacific on a YouTube quota error', () => {
    const backoff = nextBackoff({ platform: 'youtube', previous: null, reasonId: 'quota-exhausted', retryAfterSeconds: null, now: NOW });

    assert.equal(backoff.until, '2026-11-21T08:00:00.000Z');
    assert.equal(backoff.reasonId, 'quota-exhausted');
  });

  it('waits 24 hours on a quota error of another platform', () => {
    const backoff = nextBackoff({ platform: 'instagram', previous: null, reasonId: 'quota-exhausted', retryAfterSeconds: null, now: NOW });

    assert.equal(backoff.until, new Date(NOW.getTime() + 24 * HOUR_MS).toISOString());
  });

  it('lets a Retry-After longer than the step win, and ignores a shorter one', () => {
    const longer = nextBackoff({ platform: 'youtube', previous: null, reasonId: 'rate-limited', retryAfterSeconds: 3 * 3600, now: NOW });
    const shorter = nextBackoff({ platform: 'youtube', previous: null, reasonId: 'rate-limited', retryAfterSeconds: 60, now: NOW });
    const pastQuotaReset = nextBackoff({ platform: 'youtube', previous: null, reasonId: 'quota-exhausted', retryAfterSeconds: 30 * 3600, now: NOW });

    assert.equal(longer.until, new Date(NOW.getTime() + 3 * HOUR_MS).toISOString());
    assert.equal(shorter.until, new Date(NOW.getTime() + HOUR_MS).toISOString());
    assert.equal(pastQuotaReset.until, new Date(NOW.getTime() + 30 * HOUR_MS).toISOString());
  });
});
