import { Command, CommanderError } from 'commander';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { catalogEmbedCommand } from '../commands/catalog-embed.command.js';
import { catalogImportCommand } from '../commands/catalog-import.command.js';
import { catalogRescoreCommand } from '../commands/catalog-rescore.command.js';
import { catalogSearchCommand } from '../commands/catalog-search.command.js';
import { catalogSeedCommand } from '../commands/catalog-seed.command.js';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { dashboardCommand } from '../commands/dashboard.command.js';
import { doctorCommand } from '../commands/doctor.command.js';
import { modelsFetchCommand, modelsStatusCommand, modelsVerifyCommand } from '../commands/models.command.js';
import { parsePassphraseSetOptions, passphraseSetCommand, type PassphraseSource } from '../commands/passphrase-set.command.js';
import { passphraseStatusCommand } from '../commands/passphrase-status.command.js';
import { portalDisconnectCommand, portalPairCommand } from '../commands/portal.command.js';
import { runControlCommand } from '../commands/run-control.command.js';
import { runGateCommand } from '../commands/run-gate.command.js';
import { runCommand } from '../commands/run.command.js';
import { secretsSetCommand } from '../commands/secrets-set.command.js';
import { startServicesCommand, stopServicesCommand } from '../commands/services.command.js';
import { statusCommand } from '../commands/status.command.js';
import {
  parseCatalogImportOptions,
  parseDoctorOptions,
  parseEmbedScope,
  parseGateOptions,
  parseOptionalRunId,
  parseRunId,
  parseRunOptions,
  parseSecretName,
  parseSeedSourceRoot,
  parseSemanticSearchOptions,
  parseServiceName,
  parseStopTarget,
} from './arguments.js';
import { addHyperframesCommands } from './hyperframes-commands.js';
import { addOutsideSignalCommands } from './outside-signal-commands.js';
import { addPlatformCommands } from './platform-commands.js';
import { addTraceCommands } from '../traces/trace-commands.js';

type ExitCodeSink = (code: number) => void;

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function addRunCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program;
  const { args, placeholders } = text;
  program
    .command('status')
    .description(text.status.description)
    .argument('[runId]', args.runId)
    .action(async (runId: unknown) => report(await statusCommand(parseOptionalRunId(runId), dependencies)));
  program
    .command('run')
    .description(text.run.description)
    .requiredOption('--recipe <ref>', text.run.recipe)
    .requiredOption(`--brief ${placeholders.file}`, text.run.brief)
    .option('--reference <ref>', text.run.reference, collect, [])
    .option(`--title ${placeholders.text}`, text.run.title)
    .action(async (options: unknown) => report(await runCommand(parseRunOptions(options), dependencies)));
  program
    .command('pause')
    .description(text.pause.description)
    .argument('<runId>', args.runId)
    .action(async (runId: unknown) => report(await runControlCommand('pause', parseRunId(runId), dependencies)));
  program
    .command('resume')
    .description(text.resume.description)
    .argument('<runId>', args.runId)
    .action(async (runId: unknown) => report(await runControlCommand('resume', parseRunId(runId), dependencies)));
  program
    .command('approve')
    .description(text.approve.description)
    .argument('<runId>', args.runId)
    .option(`--notes ${placeholders.text}`, text.approve.notes)
    .action(async (runId: unknown, options: unknown) => report(await runGateCommand(parseGateOptions(runId, 'approved', options), dependencies)));
  program
    .command('reject')
    .description(text.reject.description)
    .argument('<runId>', args.runId)
    .requiredOption(`--notes ${placeholders.text}`, text.reject.notes)
    .action(async (runId: unknown, options: unknown) => report(await runGateCommand(parseGateOptions(runId, 'rejected', options), dependencies)));
}

function addServiceCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program;
  program
    .command('start')
    .description(text.start.description)
    .argument(text.args.service, text.args.serviceDescription)
    .action(async (service: unknown) => report(await startServicesCommand(parseServiceName(service), dependencies)));
  program
    .command('stop')
    .description(text.stop.description)
    .argument(text.args.target, text.args.targetDescription)
    .action(async (target: unknown) => {
      const parsed = parseStopTarget(target);
      report(
        parsed.kind === 'run'
          ? await runControlCommand('stop', parsed.runId, dependencies)
          : await stopServicesCommand(parsed.service, dependencies),
      );
    });
  program
    .command('doctor')
    .description(text.doctor.description)
    .option('--rebuild-index', text.doctor.rebuildIndex)
    .action(async (options: unknown) => report(await doctorCommand(parseDoctorOptions(options), dependencies)));
}

function addSetupCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program;
  const { args, placeholders } = text;
  const catalog = program.command('catalog').description(text.catalog.description);
  catalog
    .command('import')
    .description(text.catalog.import)
    .argument(args.path, args.pathDescription)
    .requiredOption(`--kind ${placeholders.kind}`, text.catalog.kind)
    .requiredOption('--id <assetId>', text.catalog.id)
    .requiredOption(`--metadata ${placeholders.file}`, text.catalog.metadata)
    .option(`--sensitivity ${placeholders.level}`, text.catalog.sensitivity)
    .option('--by-reference', text.catalog.byReference)
    .option(`--mime ${placeholders.kind}`, text.catalog.mime)
    .action(async (path: unknown, options: unknown) => report(await catalogImportCommand(parseCatalogImportOptions(path, options), dependencies)));
  catalog
    .command('seed')
    .description(text.catalog.seed)
    .option(`--source-root ${placeholders.folder}`, text.catalog.sourceRoot)
    .action(async (options: unknown) => report(await catalogSeedCommand(parseSeedSourceRoot(options), dependencies)));
  addCatalogIndexCommands(catalog, dependencies, report);

  program
    .command('secrets')
    .description(text.secrets.description)
    .command('set')
    .description(text.secrets.set)
    .argument(args.secretName, args.secretNameDescription)
    .action(async (name: unknown) => report(await secretsSetCommand(parseSecretName(name), dependencies)));

  const passphrase = program.command('passphrase').description(text.passphrase.description);
  passphrase
    .command('set')
    .description(text.passphrase.set)
    .option('--stdin', text.passphrase.stdin)
    .action(async (options: unknown) => {
      const source: PassphraseSource = parsePassphraseSetOptions(options).stdin ? { kind: 'stdin', input: process.stdin } : { kind: 'terminal' };
      report(await passphraseSetCommand(dependencies, source));
    });
  passphrase
    .command('status')
    .description(text.passphrase.status)
    .action(async () => report(await passphraseStatusCommand(dependencies)));
}

/**
 * SPEC 0003 R2-08, B19: repair and inspection only. No command here promotes a version, saves a
 * learning or starts a comparison; those owner-gated writes stay in the web.
 */
function addCatalogIndexCommands(catalog: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program;
  catalog
    .command('rescore')
    .description(text.catalog.rescore)
    .action(async () => report(await catalogRescoreCommand(dependencies)));
  catalog
    .command('embed')
    .description(text.catalog.embed)
    .option('--stale', text.catalog.stale)
    .option('--all', text.catalog.all)
    .action(async (options: unknown) => report(await catalogEmbedCommand(parseEmbedScope(options), dependencies)));
  catalog
    .command('search')
    .description(text.catalog.search)
    .requiredOption(`--semantic ${text.placeholders.text}`, text.catalog.semantic)
    .option('--limit <n>', text.catalog.limit)
    .action(async (options: unknown) => report(await catalogSearchCommand(parseSemanticSearchOptions(options), dependencies)));
}

function addModelCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program.models;
  const models = program.command('models').description(text.description);
  models
    .command('status')
    .description(text.status)
    .action(async () => report(await modelsStatusCommand(dependencies)));
  models
    .command('verify')
    .description(text.verify)
    .action(async () => report(await modelsVerifyCommand(dependencies)));
  models
    .command('fetch')
    .description(text.fetch)
    .action(async () => report(await modelsFetchCommand(dependencies)));
}

/** Ticket 07: called by the menu-bar app only; each prints one JSON line on stdout. */
function addPortalCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program.portal;
  const portal = program.command('portal').description(text.description);
  portal
    .command('pair')
    .description(text.pair)
    .action(async () => report(await portalPairCommand(dependencies)));
  portal
    .command('disconnect')
    .description(text.disconnect)
    .action(async () => report(await portalDisconnectCommand(dependencies)));
}

function buildProgram(dependencies: CommandDependencies, report: ExitCodeSink): Command {
  const program = new Command('studio');
  // Configured before the subcommands are added: commander copies these settings into each one.
  program
    .description(cliText().program.root)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => dependencies.printer.line(text.trimEnd()),
      writeErr: (text) => dependencies.printer.error(text.trimEnd()),
    });
  program.action(async () => report(await dashboardCommand(dependencies)));
  addRunCommands(program, dependencies, report);
  addServiceCommands(program, dependencies, report);
  addSetupCommands(program, dependencies, report);
  addModelCommands(program, dependencies, report);
  addPortalCommands(program, dependencies, report);
  addOutsideSignalCommands(program, dependencies, report);
  addPlatformCommands(program, dependencies, report);
  addTraceCommands(program, dependencies, report);
  addHyperframesCommands(program, dependencies, report);
  return program;
}

/**
 * Parses `argv` and runs one command. Usage problems found by commander (unknown command, missing
 * option) exit 2; help exits 0. Errors thrown by a command propagate to `main`, the single
 * boundary that turns them into an exit code and a message in the active language. Commander's
 * own words (`Usage:`, `Options:`, `error: unknown option`) stay as commander writes them.
 */
export async function runProgram(argv: readonly string[], dependencies: CommandDependencies): Promise<number> {
  let exitCode: number = ExitCode.ok;
  const program = buildProgram(dependencies, (code) => {
    exitCode = code;
  });
  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? ExitCode.ok : ExitCode.usage;
    throw error;
  }
  return exitCode;
}
