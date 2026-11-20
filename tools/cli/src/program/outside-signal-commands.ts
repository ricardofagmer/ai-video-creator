import { type Command } from 'commander';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { insightsCommand, nestInsightsSource } from '../commands/insights.command.js';
import { metricsImportCommand } from '../commands/metrics-import.command.js';
import { schedulesChangeCommand, schedulesListCommand, schedulesShowCommand } from '../commands/schedules.command.js';
import { nestMetricsImporter } from '../metrics/nest-metrics-importer.js';
import { nestScheduleGateway } from '../schedules/nest-schedule-gateway.js';
import { type ScheduleChange } from '../schedules/schedule-gateway.js';
import { parseInsightsOptions, parseMetricsImportOptions, parseScheduleId } from './arguments.js';

type ExitCodeSink = (code: number) => void;

const SCHEDULE_CHANGES: readonly ScheduleChange[] = ['pause', 'resume', 'delete'];

const changeDescriptions: Readonly<Record<ScheduleChange, string>> = {
  pause: 'pausa um agendamento: nenhum horário dispara até retomar',
  resume: 'retoma um agendamento pausado; os horários do período pausado não disparam',
  delete: 'exclui um agendamento (final; a pasta fica como registro)',
};

function addScheduleCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const schedules = program.command('schedules').description('agendamentos de execuções (criados no web)');
  schedules
    .command('list')
    .description('lista os agendamentos com status, próximo horário e perdidos em 7 dias')
    .action(async () => report(await schedulesListCommand(nestScheduleGateway, dependencies)));
  schedules
    .command('show')
    .description('mostra um agendamento: próximos horários, últimos horários e a fila de briefings')
    .argument('<id>', 'id do agendamento')
    .action(async (scheduleId: unknown) => report(await schedulesShowCommand(parseScheduleId(scheduleId), nestScheduleGateway, dependencies)));
  for (const change of SCHEDULE_CHANGES) {
    schedules
      .command(change)
      .description(changeDescriptions[change])
      .argument('<id>', 'id do agendamento')
      .action(async (scheduleId: unknown) =>
        report(await schedulesChangeCommand(change, parseScheduleId(scheduleId), { gateway: nestScheduleGateway, dependencies })),
      );
  }
}

function addMetricsCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  program
    .command('metrics')
    .description('métricas das plataformas')
    .command('import')
    .description('importa o CSV exportado por uma plataforma (até 2 MiB), pelo mesmo caminho do web')
    .argument('<arquivo>', 'arquivo CSV da plataforma')
    .requiredOption('--platform <plataforma>', 'youtube, instagram ou tiktok')
    .requiredOption('--as-of <data>', 'dia a que os números se referem (AAAA-MM-DD, nunca no futuro)')
    .option('--dry-run', 'só simula: mostra o resultado e não grava nada')
    .action(async (file: unknown, options: unknown) =>
      report(await metricsImportCommand(parseMetricsImportOptions(file, options), nestMetricsImporter, dependencies)),
    );
}

function addInsightsCommand(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  program
    .command('insights')
    .description('indicadores de sucesso do estúdio: revisão sem reparo, tempo, catálogo, custo, nota e publicações')
    .option('--json', 'imprime o resultado em JSON')
    .action(async (options: unknown) => report(await insightsCommand(parseInsightsOptions(options), nestInsightsSource, dependencies)));
}

/**
 * SPEC 0006 R3-07: `studio schedules list|show|pause|resume|delete` and `studio metrics import`;
 * PRD 0001 R4 goal 4: `studio insights`.
 */
export function addOutsideSignalCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  addScheduleCommands(program, dependencies, report);
  addMetricsCommands(program, dependencies, report);
  addInsightsCommand(program, dependencies, report);
}
