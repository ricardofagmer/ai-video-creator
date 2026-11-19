import {
  CreateScheduleRequestSchema,
  PatchScheduleRequestSchema,
  ScheduleListViewSchema,
  ScheduleViewSchema,
  apiPaths,
  type CreateScheduleRequest,
  type PatchScheduleRequest,
  type ScheduleListView,
  type ScheduleView,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 rev 5 schedule calls (SPEC 0006 sections 4.4 and 5.5). Every body is checked with its C10
 * schema before it is sent and every response is parsed with its C10 schema. A schedule only
 * prepares runs: each fired run waits at the plan gate (Q4) and stops at review; nothing here
 * approves a run or publishes.
 */
export interface SchedulesApi {
  listSchedules(): Promise<ScheduleListView>;
  getSchedule(scheduleId: string): Promise<ScheduleView>;
  /** `acceptedWorstCasePerRunUsd` must equal the pinned recipe's resolved `costPerRunUsd`, else 409. */
  createSchedule(request: CreateScheduleRequest): Promise<ScheduleView>;
  patchSchedule(scheduleId: string, request: PatchScheduleRequest): Promise<ScheduleView>;
}

export function createSchedulesApi(transport: ApiTransport): SchedulesApi {
  return {
    listSchedules: () => requestJson(transport, { method: 'GET', path: apiPaths.schedules() }, ScheduleListViewSchema),
    getSchedule: (scheduleId) => requestJson(transport, { method: 'GET', path: apiPaths.schedule(scheduleId) }, ScheduleViewSchema),
    createSchedule: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.schedules(), body: { kind: 'json', value: checkedBody(CreateScheduleRequestSchema, request) } },
        ScheduleViewSchema,
      ),
    patchSchedule: (scheduleId, request) =>
      requestJson(
        transport,
        {
          method: 'PATCH',
          path: apiPaths.schedule(scheduleId),
          body: { kind: 'json', value: checkedBody(PatchScheduleRequestSchema, request) },
        },
        ScheduleViewSchema,
      ),
  };
}

/** The schedules client for client components (same-origin BFF). */
export const browserSchedulesApi: SchedulesApi = createSchedulesApi(browserTransport);
