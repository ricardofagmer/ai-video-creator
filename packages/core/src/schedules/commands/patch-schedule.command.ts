import { Command } from '@nestjs/cqrs';
import { type ScheduleView } from '@studio/shared/api';
import { type PatchScheduleInput } from '../schedule.input';

/**
 * `PATCH /schedules/:scheduleId` and the CLI's pause, resume and delete (SPEC 0006 section 5.5):
 * pause, resume, delete, add briefs or remove a brief, each one atomic rewrite of `schedule.json`.
 */
export class PatchScheduleCommand extends Command<ScheduleView> {
  /** Validated by the handler. */
  constructor(readonly input: PatchScheduleInput) {
    super();
  }
}
