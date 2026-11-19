import { Inject, Injectable } from '@nestjs/common';
import { dueSlotSplit } from '@studio/core/schedules';
import { SCHEDULE_FORMAT_VERSION, type ScheduleCursor, type ScheduleFile, type ScheduleId } from '@studio/shared/schedules';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { BusyIntervalTracker } from './busy-interval.tracker';
import { CandidateSlotFirer } from './candidate-slot.firer';
import { ScheduleEventRecorder } from './schedule-event.recorder';
import { ScheduleScanner, type ScannedSchedule } from './schedule-scanner';
import { missedSlotLine } from './slot-line.mapper';
import { SlotLogWriter } from './slot-log.writer';

/**
 * The watcher's schedule step (SPEC 0006 section 5.6, OD4, AC 38). The daemon loop calls `evaluate`
 * only when a successful `runs/` scan found no startable run, before curations (B5), and awaits it,
 * so schedule files are written only between runs. For each `active` schedule, oldest first:
 *
 * - window: `(max(cursor.evaluatedThrough, statusSince), now]`, at most 400 slots (core
 *   `dueSlotSplit`), so nothing before creation or resume is due (R3-AC-20);
 * - every slot older than `lateGraceMs`, and every in-grace slot but the newest, is appended as
 *   `missed`: `watcher-busy` when this process was executing a run or curation at that instant
 *   (`BusyIntervalTracker`), else `watcher-not-running` (R3-AC-14, R3-AC-15). Missed slots are
 *   never replayed. Before that, each such slot is checked for a `run.json` written for it before
 *   a crash (`CandidateSlotFirer.recoverWrittenRun`): a found run gets its missing `fired` line
 *   instead, so a restart later than `lateGraceMs` still names the run and never writes a second
 *   one (R3-AC-16, "Crash safety"). An unreadable candidate folder leaves the slot `missed`: no
 *   run is written for an old slot either way;
 * - the newest in-grace slot goes to `CandidateSlotFirer`: one evaluation fires at most one run per
 *   schedule;
 * - `cursor.json` is written after the slot lines. An evaluation with no due slot writes nothing:
 *   the window simply starts from the same place next time, and the idle loop ticks every second.
 *
 * A schedule whose evaluation throws keeps its cursor and is retried on the next idle tick; lines
 * already appended by this process are remembered so they are never appended twice. Never throws.
 */
@Injectable()
export class ScheduleStep {
  /** Per schedule, the newest slot this process appended a line for since its last cursor write. */
  private readonly appendedThroughMs = new Map<ScheduleId, number>();
  private readonly failing = new Set<ScheduleId>();
  private readonly unreadable = new Set<ScheduleId>();
  private scanFailing = false;
  private evaluating = false;

  constructor(
    @Inject(ScheduleScanner) private readonly scanner: ScheduleScanner,
    @Inject(CandidateSlotFirer) private readonly firer: CandidateSlotFirer,
    @Inject(SlotLogWriter) private readonly slotLog: SlotLogWriter,
    @Inject(BusyIntervalTracker) private readonly busy: Pick<BusyIntervalTracker, 'wasBusyAt'>,
    @Inject(ScheduleEventRecorder) private readonly events: Pick<ScheduleEventRecorder, 'record'>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** True when a slot fired, so the loop scans `runs/` again at once and finds the `pending` run. */
  async evaluate(): Promise<boolean> {
    if (this.evaluating) return false;
    this.evaluating = true;
    try {
      const scanned = await this.scan();
      let fired = false;
      for (const entry of scanned) {
        if (await this.evaluateEntry(entry)) fired = true;
      }
      return fired;
    } finally {
      this.evaluating = false;
    }
  }

  private async scan(): Promise<ScannedSchedule[]> {
    try {
      const scanned = await this.scanner.scan();
      if (this.scanFailing) this.events.record({ type: 'schedules.scan-recovered' });
      this.scanFailing = false;
      return scanned;
    } catch (error) {
      // schedules/ unreadable: runs and curations are unaffected; logged once per outage.
      if (!this.scanFailing) this.events.record({ type: 'schedules.scan-failed', error: errorName(error) });
      this.scanFailing = true;
      return [];
    }
  }

  private async evaluateEntry(entry: ScannedSchedule): Promise<boolean> {
    if (entry.state === 'unreadable') {
      // No recurrence can be read, so no slot can be named: logged once per outage, never guessed.
      if (!this.unreadable.has(entry.scheduleId)) {
        this.events.record({ type: 'schedule.unreadable', scheduleId: entry.scheduleId, reasonId: 'schedule-unreadable' });
      }
      this.unreadable.add(entry.scheduleId);
      return false;
    }
    const { scheduleId } = entry.file;
    this.unreadable.delete(scheduleId);
    try {
      const fired = await this.evaluateSchedule(entry.file);
      if (this.failing.delete(scheduleId)) this.events.record({ type: 'schedule.evaluate-recovered', scheduleId });
      return fired;
    } catch (error) {
      if (!this.failing.has(scheduleId)) this.events.record({ type: 'schedule.evaluate-failed', scheduleId, error: errorName(error) });
      this.failing.add(scheduleId);
      return false;
    }
  }

  private async evaluateSchedule(schedule: ScheduleFile): Promise<boolean> {
    const { scheduleId } = schedule;
    const now = this.clock.now();
    const cursor = this.effectiveCursor(schedule, await this.scanner.cursor(scheduleId));
    const { missed, candidate } = dueSlotSplit(schedule, cursor, now);
    if (missed.length === 0 && candidate === null) return false;

    for (const slotAt of missed) {
      // A slot whose run was written before a crash keeps that run: its `fired` line, not `missed`.
      const recovery = await this.firer.recoverWrittenRun({ schedule, slotAt, now });
      if (recovery !== 'recovered') {
        const reasonId = this.busy.wasBusyAt(slotAt) ? 'watcher-busy' : 'watcher-not-running';
        await this.slotLog.append(scheduleId, missedSlotLine(slotAt, reasonId, now));
      }
      this.appendedThroughMs.set(scheduleId, slotAt.getTime());
    }
    let fired = false;
    if (candidate !== null) {
      fired = (await this.firer.handle({ schedule, slotAt: candidate, now })) === 'fired';
      this.appendedThroughMs.set(scheduleId, candidate.getTime());
    }
    await this.slotLog.advanceCursor(scheduleId, now);
    this.appendedThroughMs.delete(scheduleId);
    return fired;
  }

  /**
   * The stored cursor, moved forward to the newest slot this process already appended when a later
   * write of that evaluation failed (the cursor was not advanced), so no line is written twice.
   */
  private effectiveCursor(schedule: ScheduleFile, stored: ScheduleCursor | null): ScheduleCursor | null {
    const appendedMs = this.appendedThroughMs.get(schedule.scheduleId);
    if (appendedMs === undefined) return stored;
    const storedMs = stored === null ? Number.NEGATIVE_INFINITY : Date.parse(stored.evaluatedThrough);
    if (storedMs >= appendedMs) return stored;
    const through = new Date(appendedMs).toISOString();
    return { format: SCHEDULE_FORMAT_VERSION, scheduleId: schedule.scheduleId, evaluatedThrough: through, updatedAt: through };
  }
}
