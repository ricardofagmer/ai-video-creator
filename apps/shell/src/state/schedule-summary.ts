import { ScheduleFileSchema, nextSlots, type ScheduleFile, type ScheduleId } from '@studio/shared/schedules';
import { listScheduleIds, scheduleFilePath } from '@studio/shared/schedules/files';
import { readBoundedText } from './bounded-file';

/**
 * `nextSlotAtMs` is the earliest next slot over `active` schedules, or null when none is active.
 * `skipped` counts schedules whose file could not be read or validated.
 */
export type ScheduleSummary =
  | { status: 'ok'; nextSlotAtMs: number | null; skipped: number; truncated: boolean }
  | { status: 'unavailable' };

/**
 * The protocol keeps at most 10 live schedules, but deleted ones keep their folder; the bound keeps
 * one scan short whatever the folder holds. Newest ids (ULID order) are kept.
 */
export const SCHEDULE_SCAN_LIMIT = 200;

/**
 * The shared reader of `schedule.json` has no size bound. A schedule at every section 4.2 limit
 * (50 briefs of maximal ASCII text, pretty-printed by the writer) stays under half a MiB, so 1 MiB
 * accepts every valid document and refuses anything larger before its bytes are read.
 */
export const MAX_SCHEDULE_FILE_BYTES = 1024 * 1024;

type ScheduleRead = { kind: 'slot'; atMs: number } | { kind: 'none' } | { kind: 'unreadable' };

type ScheduleDocument = { kind: 'absent' } | { kind: 'present'; file: ScheduleFile } | { kind: 'unreadable' };

function parseScheduleDocument(text: string): ScheduleDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'unreadable' };
  }
  // The schema pins `format` to the current version, so a newer file is refused here too.
  const checked = ScheduleFileSchema.safeParse(parsed);
  return checked.success ? { kind: 'present', file: checked.data } : { kind: 'unreadable' };
}

/**
 * Bounded, link-refusing, non-blocking read: a FIFO, a link, a non-regular file or one over the
 * cap is `unreadable` and never stalls the slow poll.
 */
async function readScheduleDocument(schedulesRoot: string, scheduleId: ScheduleId): Promise<ScheduleDocument> {
  const read = await readBoundedText(scheduleFilePath({ schedulesRoot, scheduleId }, 'schedule'), { maxBytes: MAX_SCHEDULE_FILE_BYTES });
  switch (read.status) {
    case 'absent':
      return { kind: 'absent' };
    case 'read':
      return parseScheduleDocument(read.text);
    case 'rejected':
    case 'unchanged':
      return { kind: 'unreadable' };
  }
}

async function nextSlotOf(schedulesRoot: string, scheduleId: ScheduleId, nowMs: number): Promise<ScheduleRead> {
  try {
    const document = await readScheduleDocument(schedulesRoot, scheduleId);
    if (document.kind === 'unreadable') return { kind: 'unreadable' };
    // Absent only while the api or CLI is creating the folder: not an error, nothing to show yet.
    if (document.kind === 'absent' || document.file.status !== 'active') return { kind: 'none' };
    const [slot] = nextSlots({ recurrence: document.file.recurrence, timezone: document.file.timezone, after: new Date(nowMs), count: 1 });
    return slot === undefined ? { kind: 'none' } : { kind: 'slot', atMs: slot.getTime() };
  } catch {
    return { kind: 'unreadable' };
  }
}

/** Read-only walk of `<data home>/schedules/`; paused and deleted schedules are ignored. */
export async function readScheduleSummary(schedulesRoot: string, nowMs: number): Promise<ScheduleSummary> {
  let scheduleIds: ScheduleId[];
  try {
    scheduleIds = await listScheduleIds(schedulesRoot);
  } catch {
    return { status: 'unavailable' };
  }
  const scanned = scheduleIds.slice(-SCHEDULE_SCAN_LIMIT);
  let nextSlotAtMs: number | null = null;
  let skipped = 0;
  for (const scheduleId of scanned) {
    const read = await nextSlotOf(schedulesRoot, scheduleId, nowMs);
    if (read.kind === 'unreadable') skipped += 1;
    if (read.kind === 'slot' && (nextSlotAtMs === null || read.atMs < nextSlotAtMs)) nextSlotAtMs = read.atMs;
  }
  return { status: 'ok', nextSlotAtMs, skipped, truncated: scheduleIds.length > scanned.length };
}
