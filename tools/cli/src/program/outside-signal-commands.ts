import { type Command } from 'commander';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { insightsCommand, nestInsightsSource } from '../commands/insights.command.js';
import { metricsImportCommand } from '../commands/metrics-import.command.js';
import { metricsSyncCommand } from '../commands/metrics-sync.command.js';
import { schedulesChangeCommand, schedulesListCommand, schedulesShowCommand } from '../commands/schedules.command.js';
import { cliText } from '../i18n/messages.js';
import { nestMetricsImporter } from '../metrics/nest-metrics-importer.js';
import { nestPlatformGateway } from '../platforms/nest-platform-gateway.js';
import { nestScheduleGateway } from '../schedules/nest-schedule-gateway.js';
import { type ScheduleChange } from '../schedules/schedule-gateway.js';
import { parseInsightsOptions, parseMetricsImportOptions, parseScheduleId } from './arguments.js';

type ExitCodeSink = (code: number) => void;

const SCHEDULE_CHANGES: readonly ScheduleChange[] = ['pause', 'resume', 'delete'];

function addScheduleCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const { schedules: text, args } = cliText().program;
  const schedules = program.command('schedules').description(text.description);
  schedules
    .command('list')
    .description(text.list)
    .action(async () => report(await schedulesListCommand(nestScheduleGateway, dependencies)));
  schedules
    .command('show')
    .description(text.show)
    .argument('<id>', args.scheduleIdDescription)
    .action(async (scheduleId: unknown) => report(await schedulesShowCommand(parseScheduleId(scheduleId), nestScheduleGateway, dependencies)));
  for (const change of SCHEDULE_CHANGES) {
    schedules
      .command(change)
      .description(text[change])
      .argument('<id>', args.scheduleIdDescription)
      .action(async (scheduleId: unknown) =>
        report(await schedulesChangeCommand(change, parseScheduleId(scheduleId), { gateway: nestScheduleGateway, dependencies })),
      );
  }
}

function addMetricsCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const { metrics: text, args, placeholders } = cliText().program;
  const metrics = program.command('metrics').description(text.description);
  metrics
    .command('sync')
    .description(text.sync)
    .action(async () => report(await metricsSyncCommand(nestPlatformGateway, dependencies)));
  metrics
    .command('import')
    .description(text.import)
    .argument(args.csvFile, args.csvFileDescription)
    .requiredOption(`--platform ${placeholders.platform}`, text.platform)
    .requiredOption(`--as-of ${placeholders.date}`, text.asOf)
    .option('--dry-run', text.dryRun)
    .action(async (file: unknown, options: unknown) =>
      report(await metricsImportCommand(parseMetricsImportOptions(file, options), nestMetricsImporter, dependencies)),
    );
}

function addInsightsCommand(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  program
    .command('insights')
    .description(cliText().program.insights.description)
    .option('--json', cliText().program.insights.json)
    .action(async (options: unknown) => report(await insightsCommand(parseInsightsOptions(options), nestInsightsSource, dependencies)));
}

/**
 * SPEC 0006 R3-07: `studio schedules list|show|pause|resume|delete` and `studio metrics import`;
 * SPEC 0007 R4-06: `studio metrics sync`; PRD 0001 R4 goal 4: `studio insights`.
 */
export function addOutsideSignalCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  addScheduleCommands(program, dependencies, report);
  addMetricsCommands(program, dependencies, report);
  addInsightsCommand(program, dependencies, report);
}
