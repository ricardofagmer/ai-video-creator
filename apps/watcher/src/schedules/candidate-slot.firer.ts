import { Inject, Injectable } from '@nestjs/common';
import { ScheduleRunsReader, ScheduledRunFactory, SlotFactsCollector, decideSlot, type SlotGuardFacts } from '@studio/core/schedules';
import { newUlid } from '@studio/shared/run-files';
import { type ScheduleFile } from '@studio/shared/schedules';
import { errorName } from '../platform/error-name';
import { ScheduleEventRecorder } from './schedule-event.recorder';
import { ScheduledRunFiles } from './scheduled-run.files';
import { firedSlotLine, skippedSlotLine } from './slot-line.mapper';
import { SlotLogWriter } from './slot-log.writer';

export interface CandidateSlot {
  schedule: ScheduleFile;
  slotAt: Date;
  /** The evaluation instant: the slot line's `decidedAt`, the run's `createdAt`, its id's time. */
  now: Date;
}

/** `fired`: a new `pending` run was written. Every other way the slot was decided is `decided`. */
export type CandidateOutcome = 'fired' | 'decided';

/**
 * The fire candidate of one schedule (SPEC 0006 section 5.6 "guards", "fire", "Crash safety"):
 *
 * 1. Look for a `run.json` already written for this slot (a crash after the run write and before
 *    the slot line). Found: only the missing `fired` line is appended, with the run's own id and
 *    brief, so `runId` for a slot is decided once (R3-AC-16). Unknown (an unreadable candidate
 *    folder): `skipped` / `internal-error`, never a second run.
 * 2. Collect the guard facts (reads only) and apply core `decideSlot`; a skip appends its reason. A
 *    failed collection is `skipped` / `internal-error`.
 * 3. Fire: build the run with core `ScheduledRunFactory` (status `pending`, `createdBy: 'watcher'`,
 *    `correlationId: null`, the `schedule` link), write it once, then append `fired`.
 *
 * A failure of the run write or of the `fired` append throws without deciding the slot, so the
 * next idle tick looks again and step 1 finds a run that was written.
 */
@Injectable()
export class CandidateSlotFirer {
  constructor(
    @Inject(ScheduleRunsReader) private readonly runs: Pick<ScheduleRunsReader, 'findRunForSlot'>,
    @Inject(SlotFactsCollector) private readonly facts: Pick<SlotFactsCollector, 'collect'>,
    @Inject(ScheduledRunFactory) private readonly factory: Pick<ScheduledRunFactory, 'build'>,
    @Inject(ScheduledRunFiles) private readonly runFiles: ScheduledRunFiles,
    @Inject(SlotLogWriter) private readonly slotLog: SlotLogWriter,
    @Inject(ScheduleEventRecorder) private readonly events: Pick<ScheduleEventRecorder, 'record'>,
  ) {}

  async handle(candidate: CandidateSlot): Promise<CandidateOutcome> {
    const { schedule, slotAt, now } = candidate;
    const { scheduleId } = schedule;
    const existing = await this.runs.findRunForSlot({ scheduleId, slotAt });
    if (existing.state === 'found') {
      const link = await this.runFiles.linkOf({ runId: existing.runId, scheduleId, slotAt });
      await this.slotLog.append(scheduleId, firedSlotLine(slotAt, { runId: existing.runId, briefId: link.briefId }, now));
      this.events.record({ type: 'schedule.slot-recovered', scheduleId, slotAt: slotAt.toISOString(), runId: existing.runId });
      return 'decided';
    }
    if (existing.state === 'unknown') {
      await this.slotLog.append(scheduleId, skippedSlotLine(slotAt, 'internal-error', now));
      return 'decided';
    }

    const facts = await this.collectFacts(candidate);
    if (facts === null) {
      await this.slotLog.append(scheduleId, skippedSlotLine(slotAt, 'internal-error', now));
      return 'decided';
    }
    const decision = decideSlot(facts);
    if (decision.decision === 'skip') {
      await this.slotLog.append(scheduleId, skippedSlotLine(slotAt, decision.reasonId, now));
      return 'decided';
    }

    // The id's time is the evaluation instant, never before the slot: `findRunForSlot` looks only
    // at folders created at or after the slot instant.
    const runId = newUlid(now.getTime());
    const run = this.factory.build({ schedule, slotAt, brief: decision.brief, recipe: decision.recipe, runId, now });
    await this.runFiles.create(run);
    await this.slotLog.append(scheduleId, firedSlotLine(slotAt, { runId, briefId: decision.brief.briefId }, now));
    return 'fired';
  }

  /** Null when a read failed; the error is logged by class name only. */
  private async collectFacts(candidate: CandidateSlot): Promise<SlotGuardFacts | null> {
    try {
      return await this.facts.collect({ schedule: candidate.schedule, now: candidate.now });
    } catch (error) {
      this.events.record({ type: 'schedule.evaluate-failed', scheduleId: candidate.schedule.scheduleId, error: errorName(error) });
      return null;
    }
  }
}
