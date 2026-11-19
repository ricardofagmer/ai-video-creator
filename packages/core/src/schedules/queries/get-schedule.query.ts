import { Query } from '@nestjs/cqrs';
import { type ScheduleView } from '@studio/shared/api';

/** `GET /schedules/:scheduleId`: one schedule with brief bodies, next slots and the slot tail; `deleted` included. */
export class GetScheduleQuery extends Query<ScheduleView> {
  /** Validated by the handler. */
  constructor(readonly scheduleId: string) {
    super();
  }
}
