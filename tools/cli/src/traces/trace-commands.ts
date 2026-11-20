import { type Command } from 'commander';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { fileTraceSource } from './file-trace-source.js';
import { parseTracesExportOptions } from './trace-arguments.js';
import { tracesExportCommand } from './traces-export.command.js';

type ExitCodeSink = (code: number) => void;

/** SPEC 0006 R3-09, ADR 0006 option 2: `studio traces export <runId|curationId> --out <file> [--force]`. */
export function addTraceCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  program
    .command('traces')
    .description('rastros de execuções e curadorias em arquivo OTLP JSON local (sem rede)')
    .command('export')
    .description('exporta o rastro de uma execução ou curadoria para um arquivo OTLP JSON, para abrir num visualizador')
    .argument('<id>', 'id da execução ou da curadoria')
    .requiredOption('--out <arquivo>', 'arquivo de saída; não pode existir, salvo com --force')
    .option('--force', 'substitui um arquivo de saída existente')
    .action(async (targetId: unknown, options: unknown) => {
      const { dataHome } = dependencies.settings;
      const context = { source: fileTraceSource({ runs: dataHome.runs, curations: dataHome.curations }), dataHomeRoot: dataHome.root };
      report(await tracesExportCommand(parseTracesExportOptions(targetId, options), context, dependencies));
    });
}
