import { Query } from '@nestjs/cqrs';
import { type ScheduleListView } from '@studio/shared/api';

/** `GET /schedules`: every schedule not `deleted`, oldest first, briefs as ids and titles only. */
export class ListSchedulesQuery extends Query<ScheduleListView> {}
