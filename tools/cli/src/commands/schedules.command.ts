import type { ScheduleId } from '@studio/shared/schedules';
import { ExitCode } from '../errors/exit-codes.js';
import { type ScheduleChange, type ScheduleGateway } from '../schedules/schedule-gateway.js';
import { scheduleChangeLines, scheduleDetailLines, scheduleListLines } from '../schedules/schedule-text.js';
import type { CommandDependencies } from './command-dependencies.js';

/** The schedule commands print only; they take no settings, so tests need no data home. */
type ScheduleCommandDependencies = Pick<CommandDependencies, 'printer'>;

/** `studio schedules list`: every schedule that is not `deleted`; reads only. */
export async function schedulesListCommand(gateway: ScheduleGateway, dependencies: ScheduleCommandDependencies): Promise<number> {
  for (const line of scheduleListLines(await gateway.list())) dependencies.printer.line(line);
  return ExitCode.ok;
}

/** `studio schedules show <id>`: one schedule, `deleted` included (the audit record); reads only. */
export async function schedulesShowCommand(scheduleId: ScheduleId, gateway: ScheduleGateway, dependencies: ScheduleCommandDependencies): Promise<number> {
  for (const line of scheduleDetailLines(await gateway.show(scheduleId))) dependencies.printer.line(line);
  return ExitCode.ok;
}

/**
 * `studio schedules pause|resume|delete <id>`: one atomic rewrite of `schedule.json` through the
 * core handler (SPEC 0006 section 5.5). An action already in effect writes nothing; a `deleted`
 * schedule refuses with `schedule-not-editable` (exit 4).
 */
export async function schedulesChangeCommand(
  change: ScheduleChange,
  scheduleId: ScheduleId,
  options: { gateway: ScheduleGateway; dependencies: ScheduleCommandDependencies },
): Promise<number> {
  const view = await options.gateway.change(scheduleId, change);
  for (const line of scheduleChangeLines(change, view)) options.dependencies.printer.line(line);
  return ExitCode.ok;
}
