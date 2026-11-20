import { Inject, Injectable } from '@nestjs/common';
import { ScheduleStore } from '@studio/core/schedules';
import { type ScheduleCursor, type ScheduleFile, type ScheduleId } from '@studio/shared/schedules';

/**
 * What one evaluation sees in `schedules/`: the `active` schedules, and the folders whose
 * `schedule.json` failed its schema (skipped with `schedule-unreadable`, never guessed). Paused and
 * deleted schedules are left out, so they fire and log nothing (R3-AC-20).
 */
export type ScannedSchedule = { state: 'active'; file: ScheduleFile } | { state: 'unreadable'; scheduleId: ScheduleId };

/** The read side of the store the scanner needs; core `ScheduleStore` in the daemon. */
export type ScheduleReads = Pick<ScheduleStore, 'listAll' | 'readCursor'>;

/** Reads `schedules/` through core `ScheduleStore`, oldest schedule first (ULID order). */
@Injectable()
export class ScheduleScanner {
  constructor(@Inject(ScheduleStore) private readonly store: ScheduleReads) {}

  async scan(): Promise<ScannedSchedule[]> {
    const scanned: ScannedSchedule[] = [];
    for (const stored of await this.store.listAll()) {
      if (stored.state === 'unreadable') scanned.push({ state: 'unreadable', scheduleId: stored.scheduleId });
      else if (stored.file.status === 'active') scanned.push({ state: 'active', file: stored.file });
    }
    return scanned;
  }

  /** `cursor.json`, or null before the first evaluation; a corrupt cursor throws a typed error. */
  async cursor(scheduleId: ScheduleId): Promise<ScheduleCursor | null> {
    return this.store.readCursor(scheduleId);
  }
}
