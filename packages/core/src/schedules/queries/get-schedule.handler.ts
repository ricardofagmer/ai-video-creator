import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type ScheduleView } from '@studio/shared/api';
import { ScheduleIdSchema } from '@studio/shared/schedules';
import { ScheduleStore } from '../schedule-store';
import { ScheduleViewAssembler } from '../schedule-view.assembler';
import { ScheduleNotFoundError } from '../schedules.errors';
import { parseScheduleInput } from '../schedule.input';
import { GetScheduleQuery } from './get-schedule.query';

/** Reads only: `schedule.json` and the folded `slots.jsonl`. A `deleted` schedule stays readable as the audit record. */
@QueryHandler(GetScheduleQuery)
export class GetScheduleHandler implements IQueryHandler<GetScheduleQuery, ScheduleView> {
  constructor(
    private readonly store: ScheduleStore,
    private readonly assembler: ScheduleViewAssembler,
  ) {}

  async execute(query: GetScheduleQuery): Promise<ScheduleView> {
    const scheduleId = parseScheduleInput(ScheduleIdSchema, query.scheduleId, 'scheduleId');
    const file = await this.store.read(scheduleId);
    if (file === null) throw new ScheduleNotFoundError(scheduleId);
    const now = new Date();
    return this.assembler.viewOf({ file, slots: await this.store.summarizeSlots(scheduleId, now), detail: 'detail', now });
  }
}
