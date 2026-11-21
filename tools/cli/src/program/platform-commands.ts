import { type Command } from 'commander';
import { z } from 'zod';
import { PlatformCapabilitySchema, PlatformSchema, type Platform } from '@studio/shared/platforms';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import {
  platformsConnectCommand,
  platformsDisconnectCommand,
  platformsGateCommand,
  platformsListCommand,
  type GateCommandOptions,
  type PlatformCommandPorts,
} from '../commands/platforms.command.js';
import { runsPublishCommand, type RunsPublishOptions } from '../commands/runs-publish.command.js';
import { statusCommand } from '../commands/status.command.js';
import { CliUsageError } from '../errors/cli.errors.js';
import { nestPlatformGateway } from '../platforms/nest-platform-gateway.js';
import { processTerminal } from '../terminal/line-prompt.js';
import { parseRunId } from './arguments.js';

type ExitCodeSink = (code: number) => void;

const platformPorts: PlatformCommandPorts = { gateway: nestPlatformGateway, now: () => new Date() };

const PLATFORM_CHOICES = PlatformSchema.options.join(', ');

/** Boundary validation of the platform arguments; messages name the option, never echo the value. */
function parsePlatform(value: unknown): Platform {
  const parsed = PlatformSchema.safeParse(value);
  if (!parsed.success) throw new CliUsageError(`Plataforma inválida; use ${PLATFORM_CHOICES}.`);
  return parsed.data;
}

function parseGateOptions(platform: unknown, options: unknown): GateCommandOptions {
  const parsed = z.object({ capability: PlatformCapabilitySchema }).safeParse(options);
  if (!parsed.success) throw new CliUsageError(`Use --capability ${PlatformCapabilitySchema.options.join(' ou ')}.`);
  return { platform: parsePlatform(platform), capability: parsed.data.capability };
}

/** Only `--platform`: the typed confirmation is never an option (commander refuses unknown flags). */
function parsePublishOptions(runId: unknown, options: unknown): RunsPublishOptions {
  const parsed = z.object({ platform: PlatformSchema }).safeParse(options);
  if (!parsed.success) throw new CliUsageError(`Use --platform ${PLATFORM_CHOICES}.`);
  return { runId: parseRunId(runId), platform: parsed.data.platform };
}

function addPlatformsGroup(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const platforms = program.command('platforms').description('contas conectadas do YouTube, Instagram e TikTok (conectar é feito no web)');
  platforms
    .command('list')
    .description('mostra, por plataforma, o status de métricas e publicação, a conta, a última coleta e pausas')
    .action(async () => report(await platformsListCommand(platformPorts, dependencies)));
  platforms
    .command('enable')
    .description('liga métricas ou publicação de uma plataforma (só você muda um portão)')
    .argument('<plataforma>', PLATFORM_CHOICES)
    .requiredOption('--capability <capacidade>', 'metrics ou publish')
    .action(async (platform: unknown, options: unknown) =>
      report(await platformsGateCommand('enabled', parseGateOptions(platform, options), platformPorts, dependencies)),
    );
  platforms
    .command('disable')
    .description('desliga métricas ou publicação de uma plataforma')
    .argument('<plataforma>', PLATFORM_CHOICES)
    .requiredOption('--capability <capacidade>', 'metrics ou publish')
    .action(async (platform: unknown, options: unknown) =>
      report(await platformsGateCommand('awaiting-review', parseGateOptions(platform, options), platformPorts, dependencies)),
    );
  platforms
    .command('disconnect')
    .description('desconecta a conta: apaga o token do Keychain e para as chamadas à plataforma')
    .argument('<plataforma>', PLATFORM_CHOICES)
    .action(async (platform: unknown) => report(await platformsDisconnectCommand(parsePlatform(platform), platformPorts, dependencies)));
  platforms
    .command('connect')
    .description('conectar é feito só no web (página Contas); este comando só explica como')
    .argument('<plataforma>', PLATFORM_CHOICES)
    .action((platform: unknown) => report(platformsConnectCommand(parsePlatform(platform), dependencies)));
}

function addRunsGroup(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const runs = program.command('runs').description('execuções: detalhe e publicação');
  runs
    .command('show')
    .description('mostra uma execução, o que saiu da máquina e os envios às plataformas')
    .argument('<runId>', 'id da execução')
    .action(async (runId: unknown) => report(await statusCommand(parseRunId(runId), dependencies)));
  runs
    .command('publish')
    .description('pede a publicação de uma execução aprovada (precisa de terminal e de confirmação digitada)')
    .argument('<runId>', 'id da execução')
    .requiredOption('--platform <plataforma>', 'youtube ou tiktok (Instagram: publique no aplicativo e cole o link)')
    .action(async (runId: unknown, options: unknown) =>
      report(
        await runsPublishCommand(
          parsePublishOptions(runId, options),
          { gateway: nestPlatformGateway, terminal: processTerminal, now: () => new Date() },
          dependencies,
        ),
      ),
    );
}

/** SPEC 0007 R4-06: `studio platforms list|enable|disable|disconnect|connect`, `studio runs show|publish`. */
export function addPlatformCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  addPlatformsGroup(program, dependencies, report);
  addRunsGroup(program, dependencies, report);
}
