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
 * `recovered`: a `run.json` written for the slot before a crash was found and its `fired` line
 * appended. `none`: no run holds the slot. `unknown`: a candidate folder could not be read.
 */
export type SlotRunRecovery = 'recovered' | 'none' | 'unknown';

/**
 * The fire candidate of one schedule (SPEC 0006 section 5.6 "guards", "fire", "Crash safety"):
 *
 * 1. `recoverWrittenRun`: look for a `run.json` already written for this slot (a crash after the
 *    run write and before the slot line). Found: only the missing `fired` line is appended, with
 *    the run's own id and brief, so `runId` for a slot is decided once (R3-AC-16). Unknown (an
 *    unreadable candidate folder): `skipped` / `internal-error`, never a second run. The schedule
 *    step asks the same question for every slot it is about to log `missed`, because a restart
 *    later than `lateGraceMs` turns the crashed candidate into an old slot.
 * 2. Collect the guard facts (reads only) and apply core `decideSlot`; a skip appends its reason. A
 *    failed collection is `skipped` / `internal-error`.
 * 3. Claim: create `schedules/<id>/fired/<slotMs>` with O_EXCL. An existing claim means another
 *    evaluation decided to fire the slot: its run gets the missing `fired` line, or, with no run,
 *    the slot is `skipped` / `internal-error`. A slot is never fired twice, even if two processes
 *    ever held `fire.lock` together.
 * 4. Fire: build the run with core `ScheduledRunFactory` (status `pending`, `createdBy: 'watcher'`,
 *    `correlationId: null`, the `schedule` link), write it once, then append `fired`.
 *
 * A failed run write gives the claim back and throws, so the next idle tick fires the slot. A
 * failed `fired` append keeps the claim and throws; step 1 then finds the written run.
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
    const recovery = await this.recoverWrittenRun(candidate);
    if (recovery === 'recovered') return 'decided';
    if (recovery === 'unknown') {
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

    if ((await this.slotLog.claimSlot(scheduleId, slotAt)) === 'taken') return this.handleTakenClaim(candidate);

    // The id's time is the evaluation instant, never before the slot: `findRunForSlot` looks only
    // at folders created at or after the slot instant.
    const runId = newUlid(now.getTime());
    const run = this.factory.build({ schedule, slotAt, brief: decision.brief, recipe: decision.recipe, runId, now });
    try {
      await this.runFiles.create(run);
    } catch (error) {
      await this.giveClaimBack(candidate);
      throw error;
    }
    await this.slotLog.append(scheduleId, firedSlotLine(slotAt, { runId, briefId: decision.brief.briefId }, now));
    return 'fired';
  }

  /**
   * Another evaluation already claimed the slot. Its run, when one was written meanwhile, gets the
   * missing `fired` line; otherwise the slot is `skipped` / `internal-error`, never fired twice.
   */
  private async handleTakenClaim(candidate: CandidateSlot): Promise<CandidateOutcome> {
    const { schedule, slotAt, now } = candidate;
    if ((await this.recoverWrittenRun(candidate)) === 'recovered') return 'decided';
    this.events.record({ type: 'schedule.slot-claim-taken', scheduleId: schedule.scheduleId, slotAt: slotAt.toISOString() });
    await this.slotLog.append(schedule.scheduleId, skippedSlotLine(slotAt, 'internal-error', now));
    return 'decided';
  }

  /** After a failed run write: the next tick may fire the slot. A failed give-back is logged only. */
  private async giveClaimBack(candidate: CandidateSlot): Promise<void> {
    const { scheduleId } = candidate.schedule;
    try {
      await this.slotLog.releaseSlotClaim(scheduleId, candidate.slotAt);
    } catch (error) {
      this.events.record({
        type: 'schedule.slot-claim-release-failed',
        scheduleId,
        slotAt: candidate.slotAt.toISOString(),
        error: errorName(error),
      });
    }
  }

  /**
   * Appends the missing `fired` line when a run for this slot was written before a crash (R3-AC-16);
   * writes nothing otherwise. Never writes a run.
   */
  async recoverWrittenRun(slot: CandidateSlot): Promise<SlotRunRecovery> {
    const { schedule, slotAt, now } = slot;
    const { scheduleId } = schedule;
    const existing = await this.runs.findRunForSlot({ scheduleId, slotAt });
    if (existing.state !== 'found') return existing.state;
    const link = await this.runFiles.linkOf({ runId: existing.runId, scheduleId, slotAt });
    await this.slotLog.append(scheduleId, firedSlotLine(slotAt, { runId: existing.runId, briefId: link.briefId }, now));
    this.events.record({ type: 'schedule.slot-recovered', scheduleId, slotAt: slotAt.toISOString(), runId: existing.runId });
    return 'recovered';
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
