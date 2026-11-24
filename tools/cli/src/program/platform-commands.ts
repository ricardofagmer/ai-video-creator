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
import { cliText } from '../i18n/messages.js';
import { nestPlatformGateway } from '../platforms/nest-platform-gateway.js';
import { processTerminal } from '../terminal/line-prompt.js';
import { parseRunId } from './arguments.js';

type ExitCodeSink = (code: number) => void;

const platformPorts: PlatformCommandPorts = { gateway: nestPlatformGateway, now: () => new Date() };

const PLATFORM_CHOICES = PlatformSchema.options.join(', ');

/** Boundary validation of the platform arguments; messages name the option, never echo the value. */
function parsePlatform(value: unknown): Platform {
  const parsed = PlatformSchema.safeParse(value);
  if (!parsed.success) throw new CliUsageError(cliText().usage.invalidPlatform(PLATFORM_CHOICES));
  return parsed.data;
}

function parseGateOptions(platform: unknown, options: unknown): GateCommandOptions {
  const parsed = z.object({ capability: PlatformCapabilitySchema }).safeParse(options);
  if (!parsed.success) {
    const [first = 'metrics', second = 'publish'] = PlatformCapabilitySchema.options;
    throw new CliUsageError(cliText().usage.useCapability(first, second));
  }
  return { platform: parsePlatform(platform), capability: parsed.data.capability };
}

/** Only `--platform`: the typed confirmation is never an option (commander refuses unknown flags). */
function parsePublishOptions(runId: unknown, options: unknown): RunsPublishOptions {
  const parsed = z.object({ platform: PlatformSchema }).safeParse(options);
  if (!parsed.success) throw new CliUsageError(cliText().usage.usePlatform(PLATFORM_CHOICES));
  return { runId: parseRunId(runId), platform: parsed.data.platform };
}

function addPlatformsGroup(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const { platforms: text, args, placeholders } = cliText().program;
  const platforms = program.command('platforms').description(text.description);
  platforms
    .command('list')
    .description(text.list)
    .action(async () => report(await platformsListCommand(platformPorts, dependencies)));
  platforms
    .command('enable')
    .description(text.enable)
    .argument(args.platform, PLATFORM_CHOICES)
    .requiredOption(`--capability ${placeholders.capability}`, text.capability)
    .action(async (platform: unknown, options: unknown) =>
      report(await platformsGateCommand('enabled', parseGateOptions(platform, options), platformPorts, dependencies)),
    );
  platforms
    .command('disable')
    .description(text.disable)
    .argument(args.platform, PLATFORM_CHOICES)
    .requiredOption(`--capability ${placeholders.capability}`, text.capability)
    .action(async (platform: unknown, options: unknown) =>
      report(await platformsGateCommand('awaiting-review', parseGateOptions(platform, options), platformPorts, dependencies)),
    );
  platforms
    .command('disconnect')
    .description(text.disconnect)
    .argument(args.platform, PLATFORM_CHOICES)
    .action(async (platform: unknown) => report(await platformsDisconnectCommand(parsePlatform(platform), platformPorts, dependencies)));
  platforms
    .command('connect')
    .description(text.connect)
    .argument(args.platform, PLATFORM_CHOICES)
    .action((platform: unknown) => report(platformsConnectCommand(parsePlatform(platform), dependencies)));
}

function addRunsGroup(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const { runs: text, args, placeholders } = cliText().program;
  const runs = program.command('runs').description(text.description);
  runs
    .command('show')
    .description(text.show)
    .argument('<runId>', args.runId)
    .action(async (runId: unknown) => report(await statusCommand(parseRunId(runId), dependencies)));
  runs
    .command('publish')
    .description(text.publish)
    .argument('<runId>', args.runId)
    .requiredOption(`--platform ${placeholders.platform}`, text.platform)
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
