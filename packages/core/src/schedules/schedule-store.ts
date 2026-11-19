import { Injectable, Logger } from '@nestjs/common';
import { RunFileError, type JsonLinesPage } from '@studio/shared/run-files';
import { type ScheduleCursor, type ScheduleFile, type ScheduleId, type SlotLine } from '@studio/shared/schedules';
import { listScheduleIds, readScheduleCursor, readScheduleFile, readSlotLines, type ScheduleLocation } from '@studio/shared/schedules/files';
import { DataHome } from '../paths/data-home';
import { SlotLogAccumulator, type SlotLogSummary } from './slot-log-summary';
import { ScheduleFileCorruptError } from './schedules.errors';

/**
 * Bytes of `slots.jsonl` read per page. The log grows by at most one line per slot (daily at the
 * finest, about 366 lines a year), so it is read whole, but in pages, never held as one buffer.
 */
export const SLOT_LOG_PAGE_BYTES = 65_536;

/** One schedule folder as a listing sees it; a corrupt `schedule.json` is reported, never guessed. */
export type StoredSchedule = { scheduleId: ScheduleId; state: 'readable'; file: ScheduleFile } | { scheduleId: ScheduleId; state: 'unreadable' };

/**
 * The `schedules/` folders of the data home (SPEC 0006 section 4.6), read only, through the shared
 * helpers that refuse any path outside `schedules/<ULID>/`. Both the api module and the watcher's
 * read module provide it; no method writes. `ScheduleWriter` (api and CLI only) owns
 * `schedule.json` writes, and the watcher owns `cursor.json` and `slots.jsonl` in its own scope.
 */
@Injectable()
export class ScheduleStore {
  private readonly logger = new Logger(ScheduleStore.name);

  constructor(private readonly dataHome: DataHome) {}

  location(scheduleId: ScheduleId): ScheduleLocation {
    return { schedulesRoot: this.dataHome.schedules, scheduleId };
  }

  /** `schedule.json`, or null when the folder has none (yet). A corrupt file is a typed error. */
  async read(scheduleId: ScheduleId): Promise<ScheduleFile | null> {
    let file: ScheduleFile;
    try {
      const state = await readScheduleFile(this.location(scheduleId));
      if (state.status === 'absent') return null;
      file = state.value;
    } catch (error) {
      if (error instanceof RunFileError) throw new ScheduleFileCorruptError(scheduleId, 'schedule.json');
      throw error;
    }
    if (file.scheduleId !== scheduleId) throw new ScheduleFileCorruptError(scheduleId, 'schedule.json');
    return file;
  }

  /**
   * Every schedule folder, oldest first (ULID order). An absent `schedule.json` (a folder being
   * created) is left out; a corrupt one is listed as `unreadable` and logged by id, so the watcher
   * can skip it with `schedule-unreadable` and the limit still counts it.
   */
  async listAll(): Promise<StoredSchedule[]> {
    const stored: StoredSchedule[] = [];
    for (const scheduleId of await listScheduleIds(this.dataHome.schedules)) {
      try {
        const file = await this.read(scheduleId);
        if (file !== null) stored.push({ scheduleId, state: 'readable', file });
      } catch (error) {
        if (!(error instanceof ScheduleFileCorruptError)) throw error;
        this.logger.warn({ event: 'schedule.list-unreadable', scheduleId, errorName: error.name });
        stored.push({ scheduleId, state: 'unreadable' });
      }
    }
    return stored;
  }

  /** `cursor.json`, or null before the watcher first evaluated the schedule. */
  async readCursor(scheduleId: ScheduleId): Promise<ScheduleCursor | null> {
    let cursor: ScheduleCursor;
    try {
      const state = await readScheduleCursor(this.location(scheduleId));
      if (state.status === 'absent') return null;
      cursor = state.value;
    } catch (error) {
      if (error instanceof RunFileError) throw new ScheduleFileCorruptError(scheduleId, 'cursor.json');
      throw error;
    }
    if (cursor.scheduleId !== scheduleId) throw new ScheduleFileCorruptError(scheduleId, 'cursor.json');
    return cursor;
  }

  /**
   * Complete slot lines from a byte offset, at most one page; the api's fired-run index sync keeps
   * `nextByte` per schedule (SPEC 0006 section 5.7). A bytes tail mid-append is read next time.
   */
  async readSlotLinesFrom(scheduleId: ScheduleId, fromByte: number): Promise<JsonLinesPage<SlotLine>> {
    try {
      return await readSlotLines(this.location(scheduleId), fromByte, SLOT_LOG_PAGE_BYTES);
    } catch (error) {
      if (error instanceof RunFileError) throw new ScheduleFileCorruptError(scheduleId, 'slots.jsonl');
      throw error;
    }
  }

  /** The whole `slots.jsonl` folded page by page; a missing file is an empty log. */
  async summarizeSlots(scheduleId: ScheduleId, now: Date): Promise<SlotLogSummary> {
    const accumulator = new SlotLogAccumulator(now);
    let fromByte = 0;
    for (;;) {
      const page = await this.readSlotLinesFrom(scheduleId, fromByte);
      for (const line of page.entries) accumulator.add(line);
      // No complete line left: the end of the file, or a tail the watcher is still appending.
      if (page.nextByte === fromByte) break;
      fromByte = page.nextByte;
    }
    return accumulator.result();
  }
}
