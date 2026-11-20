import { GetScheduleQuery, ListSchedulesQuery, PatchScheduleCommand } from '@studio/core/schedules';
import { withCliContext } from '../nest/cli-context.js';
import { type ScheduleGateway } from './schedule-gateway.js';

/**
 * The schedule port backed by the core handlers in the CLI's Nest context, the same ones the api
 * boots: `PatchScheduleCommand` is one atomic rewrite of `schedule.json` (no correlation id from
 * the CLI); the queries only read `schedule.json` and the folded `slots.jsonl`.
 */
export const nestScheduleGateway: ScheduleGateway = {
  list: () => withCliContext((context) => context.queryBus.execute(new ListSchedulesQuery())),
  show: (scheduleId) => withCliContext((context) => context.queryBus.execute(new GetScheduleQuery(scheduleId))),
  change: (scheduleId, change) =>
    withCliContext((context) =>
      context.commandBus.execute(new PatchScheduleCommand({ scheduleId, request: { action: change }, correlationId: null })),
    ),
};
