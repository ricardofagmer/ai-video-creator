import { type Command } from 'commander';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { cliText } from '../i18n/messages.js';
import { fileTraceSource } from './file-trace-source.js';
import { parseTracesExportOptions } from './trace-arguments.js';
import { tracesExportCommand } from './traces-export.command.js';

type ExitCodeSink = (code: number) => void;

/** SPEC 0006 R3-09, ADR 0006 option 2: `studio traces export <runId|curationId> --out <file> [--force]`. */
export function addTraceCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const { traces: text, args, placeholders } = cliText().program;
  program
    .command('traces')
    .description(text.description)
    .command('export')
    .description(text.export)
    .argument('<id>', args.traceIdDescription)
    .requiredOption(`--out ${placeholders.file}`, text.out)
    .option('--force', text.force)
    .action(async (targetId: unknown, options: unknown) => {
      const { dataHome } = dependencies.settings;
      const context = { source: fileTraceSource({ runs: dataHome.runs, curations: dataHome.curations }), dataHomeRoot: dataHome.root };
      report(await tracesExportCommand(parseTracesExportOptions(targetId, options), context, dependencies));
    });
}
