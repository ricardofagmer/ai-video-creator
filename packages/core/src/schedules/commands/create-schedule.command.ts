import { Command } from '@nestjs/cqrs';
import { type ScheduleView } from '@studio/shared/api';
import { type CreateScheduleInput } from '../schedule.input';

/**
 * `POST /schedules` and `studio schedules` create (SPEC 0006 section 5.5): time, limit, pinned
 * recipe, cost consent, then the exclusive `schedules/<ULID>/schedule.json` at `active`. The first
 * failure refuses and nothing is written.
 */
export class CreateScheduleCommand extends Command<ScheduleView> {
  /** Validated by the handler. */
  constructor(readonly input: CreateScheduleInput) {
    super();
  }
}
