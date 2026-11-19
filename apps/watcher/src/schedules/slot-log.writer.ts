import { Inject, Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { SCHEDULE_FORMAT_VERSION, type ScheduleId, type SlotLine } from '@studio/shared/schedules';
import { appendSlotLine, writeScheduleCursor, type ScheduleLocation } from '@studio/shared/schedules/files';
import { ScheduleEventRecorder } from './schedule-event.recorder';

/**
 * The watcher's two schedule files (SPEC 0006 section 4.6, K2, R3-AC-19): one appended line per
 * decided slot in `slots.jsonl`, each copied to the daemon log as a `schedule.slot` event, and the
 * `cursor.json` rewrite after the lines of an evaluation. Both go through the shared helpers, which
 * resolve only inside `schedules/<ULID>/`. It imports only the watcher's two writers of those
 * helpers; the watcher never writes `schedule.json` (R3-AC-19).
 */
@Injectable()
export class SlotLogWriter {
  constructor(
    @Inject(DataHome) private readonly dataHome: DataHome,
    @Inject(ScheduleEventRecorder) private readonly events: Pick<ScheduleEventRecorder, 'record'>,
  ) {}

  /** Appends the line, then records the event; an append that throws records nothing. */
  async append(scheduleId: ScheduleId, line: SlotLine): Promise<void> {
    await appendSlotLine(this.location(scheduleId), line);
    this.events.record({
      type: 'schedule.slot',
      scheduleId,
      slotAt: line.slotAt,
      result: line.result,
      reasonId: line.reasonId,
      runId: line.runId,
      latenessMs: Math.max(0, Date.parse(line.decidedAt) - Date.parse(line.slotAt)),
    });
  }

  /** `evaluatedThrough` is the evaluation instant, written only after its slot lines. */
  async advanceCursor(scheduleId: ScheduleId, evaluatedThrough: Date): Promise<void> {
    const at = evaluatedThrough.toISOString();
    await writeScheduleCursor(this.location(scheduleId), { format: SCHEDULE_FORMAT_VERSION, scheduleId, evaluatedThrough: at, updatedAt: at });
  }

  private location(scheduleId: ScheduleId): ScheduleLocation {
    return { schedulesRoot: this.dataHome.schedules, scheduleId };
  }
}
