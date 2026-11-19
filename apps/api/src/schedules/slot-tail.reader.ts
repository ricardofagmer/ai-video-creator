import { Inject, Injectable } from '@nestjs/common';
import { ScheduleStore } from '@studio/core/schedules';
import { type JsonLinesPage } from '@studio/shared/run-files';
import { type ScheduleId, type SlotLine } from '@studio/shared/schedules';

/** The read-only slice of core's `ScheduleStore` the tail reader uses (the store satisfies it). */
export interface SlotLogSource {
  listAll(): Promise<readonly { scheduleId: ScheduleId }[]>;
  readSlotLinesFrom(scheduleId: ScheduleId, fromByte: number): Promise<JsonLinesPage<SlotLine>>;
}

/** One `fired` line seen for the first time by this api process. */
export interface FiredSlot {
  scheduleId: ScheduleId;
  runId: string;
  decidedAt: string;
}

/** A schedule whose log could not be read this time; its offset stays where it was. */
export interface UnreadableSlotLog {
  scheduleId: ScheduleId;
  error: unknown;
}

export interface SlotTail {
  fired: FiredSlot[];
  unreadable: UnreadableSlotLog[];
}

/**
 * Reads the `slots.jsonl` lines appended since this process last looked, through core's read-only
 * `ScheduleStore` (SPEC 0006 section 5.7, L5). It keeps one in-memory byte offset per schedule and
 * returns only the `fired` lines past it. It never writes: `cursor.json` and `slots.jsonl` belong
 * to the watcher (ADR 0003, K2). A tail the watcher is still appending is read on the next look.
 */
@Injectable()
export class SlotTailReader {
  private readonly offsets = new Map<ScheduleId, number>();

  constructor(@Inject(ScheduleStore) private readonly store: SlotLogSource) {}

  async readNew(): Promise<SlotTail> {
    const tail: SlotTail = { fired: [], unreadable: [] };
    for (const { scheduleId } of await this.store.listAll()) {
      try {
        tail.fired.push(...(await this.readSchedule(scheduleId)));
      } catch (error) {
        tail.unreadable.push({ scheduleId, error });
      }
    }
    return tail;
  }

  private async readSchedule(scheduleId: ScheduleId): Promise<FiredSlot[]> {
    const fired: FiredSlot[] = [];
    let fromByte = this.offsets.get(scheduleId) ?? 0;
    for (;;) {
      const page = await this.store.readSlotLinesFrom(scheduleId, fromByte);
      for (const line of page.entries) {
        if (line.result === 'fired' && line.runId !== null) fired.push({ scheduleId, runId: line.runId, decidedAt: line.decidedAt });
      }
      // No complete line left: the end of the log, or a line the watcher is still appending.
      if (page.nextByte === fromByte) break;
      fromByte = page.nextByte;
    }
    // Moved only after the whole read succeeded: a failed page is read again next time, never skipped.
    this.offsets.set(scheduleId, fromByte);
    return fired;
  }
}
