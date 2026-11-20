import { type PipeTransform } from '@nestjs/common';
import { ScheduleTimeInvalidError } from '@studio/core/schedules';
import { CreateScheduleRequestSchema, type CreateScheduleRequest } from '@studio/shared/api';
import { RequestValidationError } from '../platform/api.errors';

const MAX_REPORTED_ISSUES = 50;

/**
 * Boundary validation of `POST /schedules` with the C10 rev 5 schema. A zone the runtime does not
 * know or a malformed recurrence is the contract's 422 `schedule-time-invalid` (SPEC 0006 section
 * 5.5 step 1, `CreateScheduleRequestSchema`), the same answer core gives the CLI; any other shape
 * problem is the usual 400. Issues carry the path and zod code only, never a value: titles and
 * briefs are owner text (K7).
 */
export class CreateScheduleBodyPipe implements PipeTransform<unknown, CreateScheduleRequest> {
  transform(value: unknown): CreateScheduleRequest {
    const parsed = CreateScheduleRequestSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    const { issues } = parsed.error;
    if (issues.some((issue) => issue.path[0] === 'timezone')) throw new ScheduleTimeInvalidError('timezone');
    if (issues.some((issue) => issue.path[0] === 'recurrence')) throw new ScheduleTimeInvalidError('recurrence');
    throw new RequestValidationError(issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({ path: issue.path.join('.').slice(0, 200), code: issue.code })));
  }
}
