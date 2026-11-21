import { localDateOf, type MetricResult, type MetricTarget } from '@studio/core/platforms';
import { type IsoDate } from '@studio/shared/metrics';
import {
  PollDateInvalidError,
  pollDue,
  pollRules,
  type MetricBatchRow,
  type Platform,
  type PlatformMode,
  type PollBackoff,
  type PollBackoffReason,
  type PollCursorEntry,
} from '@studio/shared/platforms';
import { type PollTargetRow } from './publication-targets.reader';

/*
 * The pure parts of the metrics poll (SPEC 0007 sections 5.5 and 5.7, OD3): which publications are
 * due, how answers move the cursor, and how long a failed pass waits. No clock, file or call here.
 */

/** `polls/cursor.json` entries by publication id. */
export type CursorEntries = Record<string, PollCursorEntry>;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const mediaIdPattern = /^[A-Za-z0-9_.-]{1,64}$/;

const neverPolled: PollCursorEntry = Object.freeze({ lastPolledOn: null, stopped: null, strikes: 0, platformMediaId: null });

function entryOf(entries: CursorEntries, publicationId: string): PollCursorEntry {
  return (Object.hasOwn(entries, publicationId) ? entries[publicationId] : undefined) ?? neverPolled;
}

/** Step 1: cursor entries whose publication is gone are dropped. */
export function pruneEntries(entries: CursorEntries, existingIds: ReadonlySet<string>): CursorEntries {
  const kept: CursorEntries = {};
  for (const [publicationId, entry] of Object.entries(entries)) if (existingIds.has(publicationId)) kept[publicationId] = entry;
  return kept;
}

export interface PassPlan {
  /** At most `pollRules.maxPublicationsPerPass`, never-polled first, then the longest-waiting. */
  targets: MetricTarget[];
  due: number;
  /** Publications this plan stopped (`window-closed`); already set in `entries`. */
  stopped: number;
  entries: CursorEntries;
}

/**
 * Whether this mode may poll the row (B6, finding C11): live mode never polls a mock publication;
 * mock mode polls only mock publications, so a mock answer never marks a manual or studio
 * publication, which has no mock connection behind it, as polled.
 */
function isPollableIn(mode: PlatformMode, origin: string): boolean {
  return mode === 'live' ? origin !== 'mock' : origin === 'mock';
}

/**
 * Steps 1 to 3 for one platform: its rows pollable in this mode (`isPollableIn`), not stopped,
 * through `pollDue(publishedOn ?? local day of recordedAt, lastPolledOn, today)`. A row past day 180
 * is stopped `window-closed`. A stored date that is not a calendar day is skipped, never guessed.
 */
export function planPass(options: { platform: Platform; mode: PlatformMode; rows: readonly PollTargetRow[]; entries: CursorEntries; today: IsoDate }): PassPlan {
  const entries: CursorEntries = { ...options.entries };
  const due: { target: MetricTarget; lastPolledOn: string }[] = [];
  let stopped = 0;
  for (const row of options.rows) {
    if (row.platform !== options.platform || !isPollableIn(options.mode, row.origin)) continue;
    const entry = entryOf(entries, row.publicationId);
    if (entry.stopped !== null) continue;
    let decision: ReturnType<typeof pollDue>;
    try {
      decision = pollDue(row.publishedOn ?? localDateOf(row.recordedAt), entry.lastPolledOn, options.today);
    } catch (error) {
      if (error instanceof PollDateInvalidError) continue;
      throw error;
    }
    if (decision.status === 'stopped') {
      entries[row.publicationId] = { ...entry, stopped: decision.reason };
      stopped += 1;
    } else if (decision.status === 'due') {
      const platformMediaId = entry.platformMediaId ?? row.platformMediaId;
      due.push({
        target: { publicationId: row.publicationId, platformVideoId: row.platformVideoId, platformMediaId, dayIndex: decision.dayIndex },
        lastPolledOn: entry.lastPolledOn ?? '',
      });
    }
  }
  due.sort((left, right) => left.lastPolledOn.localeCompare(right.lastPolledOn));
  return { targets: due.slice(0, pollRules.maxPublicationsPerPass).map((item) => item.target), due: due.length, stopped, entries };
}

export interface AppliedResults {
  rows: MetricBatchRow[];
  entries: CursorEntries;
  polled: number;
  /** Publications stopped by their third strike (`not-found` / `not-owned`). */
  stopped: number;
}

/**
 * Step 4: an answer moves the entry to `lastPolledOn = today`. A publication the platform does not
 * know, or that another account owns, takes a strike; the third, on a third day, stops it. Answers
 * for ids that were not asked, and repeated answers, are ignored (K10).
 */
export function applyResults(options: { targets: readonly MetricTarget[]; results: readonly MetricResult[]; entries: CursorEntries; today: IsoDate }): AppliedResults {
  const entries: CursorEntries = { ...options.entries };
  const asked = new Set(options.targets.map((target) => target.publicationId));
  const answered = new Set<string>();
  const rows: MetricBatchRow[] = [];
  let stopped = 0;
  for (const result of options.results) {
    const { publicationId } = result;
    if (!asked.has(publicationId) || answered.has(publicationId)) continue;
    answered.add(publicationId);
    const entry = entryOf(entries, publicationId);
    if (result.status === 'ok') {
      const resolved = result.platformMediaId !== null && mediaIdPattern.test(result.platformMediaId) ? result.platformMediaId : entry.platformMediaId;
      entries[publicationId] = { lastPolledOn: options.today, stopped: null, strikes: 0, platformMediaId: resolved };
      rows.push({ publicationId, metrics: result.metrics });
      continue;
    }
    // One strike per local day at most: the due rule polls a publication at most once a day.
    const strikes = entry.lastPolledOn === options.today ? entry.strikes : Math.min(entry.strikes + 1, pollRules.notFoundStrikes);
    const isStopped = strikes >= pollRules.notFoundStrikes;
    if (isStopped) stopped += 1;
    entries[publicationId] = { ...entry, lastPolledOn: options.today, strikes, stopped: isStopped ? result.status : null };
  }
  return { rows, entries, polled: answered.size, stopped };
}

const pacificClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * The next midnight Pacific, when the YouTube quota resets (section 5.1 [G3]). On the two days a
 * year the clocks change the answer can be an hour off, which only shifts one wait by an hour.
 */
export function nextPacificMidnight(now: Date): number {
  const parts = pacificClock.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number.parseInt(parts.find((item) => item.type === type)?.value ?? '0', 10);
  const elapsedMs = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000 + now.getMilliseconds();
  return now.getTime() - elapsedMs + DAY_MS;
}

/**
 * Section 5.7: 1, 2, 4, 8, then 24 hours by consecutive failed passes; a quota error waits until the
 * next reset (YouTube: midnight Pacific) or 24 hours; a `Retry-After` longer than the step wins.
 */
export function nextBackoff(options: {
  platform: Platform;
  previous: PollBackoff | null;
  reasonId: PollBackoffReason;
  retryAfterSeconds: number | null;
  now: Date;
}): PollBackoff {
  const nowMs = options.now.getTime();
  const level = Math.min((options.previous?.level ?? 0) + 1, pollRules.backoffHours.length);
  let untilMs = nowMs + (pollRules.backoffHours[level - 1] ?? 24) * HOUR_MS;
  if (options.reasonId === 'quota-exhausted') untilMs = options.platform === 'youtube' ? nextPacificMidnight(options.now) : nowMs + DAY_MS;
  if (options.retryAfterSeconds !== null && options.retryAfterSeconds > 0) untilMs = Math.max(untilMs, nowMs + options.retryAfterSeconds * 1000);
  return { reasonId: options.reasonId, level, until: new Date(untilMs).toISOString() };
}
