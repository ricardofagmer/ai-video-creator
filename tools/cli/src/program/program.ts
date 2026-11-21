import { Command, CommanderError } from 'commander';
import { ExitCode } from '../errors/exit-codes.js';
import { catalogEmbedCommand } from '../commands/catalog-embed.command.js';
import { catalogImportCommand } from '../commands/catalog-import.command.js';
import { catalogRescoreCommand } from '../commands/catalog-rescore.command.js';
import { catalogSearchCommand } from '../commands/catalog-search.command.js';
import { catalogSeedCommand } from '../commands/catalog-seed.command.js';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { dashboardCommand } from '../commands/dashboard.command.js';
import { doctorCommand } from '../commands/doctor.command.js';
import { modelsFetchCommand, modelsStatusCommand, modelsVerifyCommand } from '../commands/models.command.js';
import { passphraseSetCommand } from '../commands/passphrase-set.command.js';
import { passphraseStatusCommand } from '../commands/passphrase-status.command.js';
import { runControlCommand } from '../commands/run-control.command.js';
import { runCommand } from '../commands/run.command.js';
import { secretsSetCommand } from '../commands/secrets-set.command.js';
import { startServicesCommand, stopServicesCommand } from '../commands/services.command.js';
import { statusCommand } from '../commands/status.command.js';
import {
  parseCatalogImportOptions,
  parseDoctorOptions,
  parseEmbedScope,
  parseOptionalRunId,
  parseRunId,
  parseRunOptions,
  parseSecretName,
  parseSeedSourceRoot,
  parseSemanticSearchOptions,
  parseServiceName,
  parseStopTarget,
} from './arguments.js';
import { addOutsideSignalCommands } from './outside-signal-commands.js';
import { addPlatformCommands } from './platform-commands.js';
import { addTraceCommands } from '../traces/trace-commands.js';

type ExitCodeSink = (code: number) => void;

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function addRunCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  program
    .command('status')
    .description('lista as execuções recentes ou mostra uma execução')
    .argument('[runId]', 'id da execução')
    .action(async (runId: unknown) => report(await statusCommand(parseOptionalRunId(runId), dependencies)));
  program
    .command('run')
    .description('cria uma execução a partir de uma receita e de um briefing')
    .requiredOption('--recipe <ref>', 'receita no formato receita@versão')
    .requiredOption('--brief <arquivo>', 'arquivo JSON com o briefing')
    .option('--reference <ref>', 'referência do catálogo (ativo@versão); repita para várias', collect, [])
    .option('--title <texto>', 'título da execução')
    .action(async (options: unknown) => report(await runCommand(parseRunOptions(options), dependencies)));
  program
    .command('pause')
    .description('pausa a execução depois do passo atual')
    .argument('<runId>', 'id da execução')
    .action(async (runId: unknown) => report(await runControlCommand('pause', parseRunId(runId), dependencies)));
  program
    .command('resume')
    .description('retoma uma execução pausada, interrompida ou com falha')
    .argument('<runId>', 'id da execução')
    .action(async (runId: unknown) => report(await runControlCommand('resume', parseRunId(runId), dependencies)));
}

function addServiceCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  program
    .command('start')
    .description('inicia a api e o web em 127.0.0.1 (ou só um deles)')
    .argument('[serviço]', 'web ou api')
    .action(async (service: unknown) => report(await startServicesCommand(parseServiceName(service), dependencies)));
  program
    .command('stop')
    .description('para o web e a api, um deles, ou uma execução pelo id')
    .argument('[alvo]', 'web, api ou id da execução')
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
    .description('verifica web, api, watcher, ffmpeg, curadorias, agendamentos, banco, armazenamento, referências, plataformas e o modelo e o índice de busca')
    .option('--rebuild-index', 'reconstrói o índice de execuções a partir das pastas')
    .action(async (options: unknown) => report(await doctorCommand(parseDoctorOptions(options), dependencies)));
}

function addSetupCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const catalog = program.command('catalog').description('catálogo de ativos');
  catalog
    .command('import')
    .description('importa um arquivo ou pasta para o catálogo')
    .argument('<caminho>', 'arquivo ou pasta')
    .requiredOption('--kind <tipo>', 'tipo do ativo')
    .requiredOption('--id <assetId>', 'id do novo ativo')
    .requiredOption('--metadata <arquivo>', 'arquivo JSON com os metadados do ativo')
    .option('--sensitivity <nível>', 'sensibilidade (biometric exige --by-reference)')
    .option('--by-reference', 'registra por referência, sem copiar')
    .option('--mime <tipo>', 'tipo MIME quando a extensão não basta')
    .action(async (path: unknown, options: unknown) => report(await catalogImportCommand(parseCatalogImportOptions(path, options), dependencies)));
  catalog
    .command('seed')
    .description('registra os ativos iniciais do studio')
    .option('--source-root <pasta>', 'pasta de origem dos ativos iniciais')
    .action(async (options: unknown) => report(await catalogSeedCommand(parseSeedSourceRoot(options), dependencies)));
  addCatalogIndexCommands(catalog, dependencies, report);

  program
    .command('secrets')
    .description('chaves de provedores e credenciais dos aplicativos das plataformas no Keychain')
    .command('set')
    .description('guarda uma chave ou credencial no Keychain (o valor é pedido pelo macOS, nunca na linha de comando)')
    .argument('<nome>', 'nome da chave')
    .action(async (name: unknown) => report(await secretsSetCommand(parseSecretName(name), dependencies)));

  const passphrase = program.command('passphrase').description('senha de acesso ao web');
  passphrase
    .command('set')
    .description('define a senha do studio (pedida duas vezes, sem eco)')
    .action(async () => report(await passphraseSetCommand(dependencies)));
  passphrase
    .command('status')
    .description('informa se a senha do studio já foi definida (sai com 3 quando não foi)')
    .action(async () => report(await passphraseStatusCommand(dependencies)));
}

/**
 * SPEC 0003 R2-08, B19: repair and inspection only. No command here promotes a version, saves a
 * learning or starts a comparison; those owner-gated writes stay in the web.
 */
function addCatalogIndexCommands(catalog: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  catalog
    .command('rescore')
    .description('recalcula as notas de qualidade a partir das revisões registradas')
    .action(async () => report(await catalogRescoreCommand(dependencies)));
  catalog
    .command('embed')
    .description('indexa para a busca por significado as versões pendentes, com o modelo local')
    .option('--stale', 'só as versões com vetor de outro modelo')
    .option('--all', 'reindexa todas as versões')
    .action(async (options: unknown) => report(await catalogEmbedCommand(parseEmbedScope(options), dependencies)));
  catalog
    .command('search')
    .description('busca por significado no catálogo, com o modelo local (sem rede)')
    .requiredOption('--semantic <texto>', 'o que procurar, em linguagem natural (até 500 caracteres)')
    .option('--limit <n>', 'quantos resultados (1 a 20, padrão 8)')
    .action(async (options: unknown) => report(await catalogSearchCommand(parseSemanticSearchOptions(options), dependencies)));
}

function addModelCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const models = program.command('models').description('modelo local da busca por significado');
  models
    .command('status')
    .description('mostra o manifesto, o estado do modelo e as contagens do índice')
    .action(async () => report(await modelsStatusCommand(dependencies)));
  models
    .command('verify')
    .description('confere tamanho e sha-256 de cada arquivo do modelo com o manifesto (sai com 6 se algum não confere)')
    .action(async () => report(await modelsVerifyCommand(dependencies)));
  models
    .command('fetch')
    .description('baixa os arquivos fixados no manifesto (o único comando que usa a rede; não envia dados do catálogo)')
    .action(async () => report(await modelsFetchCommand(dependencies)));
}

function buildProgram(dependencies: CommandDependencies, report: ExitCodeSink): Command {
  const program = new Command('studio');
  // Configured before the subcommands are added: commander copies these settings into each one.
  program
    .description('Video Studio: painel e comandos do terminal')
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
  addOutsideSignalCommands(program, dependencies, report);
  addPlatformCommands(program, dependencies, report);
  addTraceCommands(program, dependencies, report);
  return program;
}

/**
 * Parses `argv` and runs one command. Usage problems found by commander (unknown command, missing
 * option) exit 2; help exits 0. Errors thrown by a command propagate to `main`, the single
 * boundary that turns them into an exit code and a pt-BR message.
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
