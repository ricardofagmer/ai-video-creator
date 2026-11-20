import { Inject, Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { SCHEDULE_FORMAT_VERSION, type ScheduleId, type SlotLine } from '@studio/shared/schedules';
import {
  acquireFireLock,
  appendSlotLine,
  claimSlot,
  readSlotLineTail,
  releaseFireLock,
  releaseSlotClaim,
  writeScheduleCursor,
  type FireLockResult,
  type ScheduleLocation,
  type SlotClaimResult,
} from '@studio/shared/schedules/files';
import { ScheduleEventRecorder } from './schedule-event.recorder';

/**
 * The watcher's schedule files (SPEC 0006 section 4.6, K2, R3-AC-19): one appended line per
 * decided slot in `slots.jsonl`, each copied to the daemon log as a `schedule.slot` event, the
 * `cursor.json` rewrite after the lines of an evaluation, the `fire.lock` held around it and the
 * `fired/<slotMs>` claim taken before a run is written. All go through the shared helpers, which
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

  /**
   * The schedule's `fire.lock` for this process (OD4): held for one evaluation, so a second
   * daemon on the same data home waits instead of deciding the same slots.
   */
  async acquireFireLock(scheduleId: ScheduleId): Promise<FireLockResult> {
    return acquireFireLock(this.location(scheduleId), process.pid);
  }

  async releaseFireLock(scheduleId: ScheduleId): Promise<void> {
    await releaseFireLock(this.location(scheduleId), process.pid);
  }

  /**
   * The slot's `fired/<slotMs>` claim for this process, taken before its run is written: `taken`
   * means some evaluation already decided to fire the slot, so it is never fired again.
   */
  async claimSlot(scheduleId: ScheduleId, slotAt: Date): Promise<SlotClaimResult> {
    return claimSlot(this.location(scheduleId), slotAt, process.pid);
  }

  /** Gives this process's claim back after its run write failed; another pid's claim stays. */
  async releaseSlotClaim(scheduleId: ScheduleId, slotAt: Date): Promise<void> {
    await releaseSlotClaim(this.location(scheduleId), slotAt, process.pid);
  }

  /**
   * Instants (ms) of the slots already in the tail of `slots.jsonl`, whatever their result. Lines
   * that do not parse are passed over and counted in a `schedule.slot-log-damaged` event.
   */
  async loggedSlotTimes(scheduleId: ScheduleId): Promise<Set<number>> {
    const tail = await readSlotLineTail(this.location(scheduleId));
    if (tail.unreadableLines > 0) this.events.record({ type: 'schedule.slot-log-damaged', scheduleId, unreadableLines: tail.unreadableLines });
    return new Set(tail.lines.map((line) => Date.parse(line.slotAt)));
  }

  private location(scheduleId: ScheduleId): ScheduleLocation {
    return { schedulesRoot: this.dataHome.schedules, scheduleId };
  }
}
