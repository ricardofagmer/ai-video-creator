import { type Command } from 'commander';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { hyperframesChromeInstallCommand } from '../commands/hyperframes-chrome.command.js';
import { hyperframesTraceCommand } from '../commands/hyperframes-trace.command.js';
import { hyperframesDisableCommand, hyperframesEnableCommand, hyperframesStatusCommand } from '../commands/hyperframes.command.js';
import { hyperframesPorts } from '../hyperframes/real-ports.js';
import { cliText } from '../i18n/messages.js';

type ExitCodeSink = (code: number) => void;

/**
 * `studio hyperframes` (SPEC 0008 sections 5.5 to 5.7). None of these subcommands takes an option:
 * commander refuses unknown flags, so no flag can supply the typed confirmations of `chrome
 * install` and `trace` (AC 69).
 */
export function addHyperframesCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const text = cliText().program.hyperframes;
  const hyperframes = program.command('hyperframes').description(text.description);
  hyperframes
    .command('status')
    .description(text.status)
    .action(async () => report(await hyperframesStatusCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('chrome')
    .description(text.chrome)
    .command('install')
    .description(text.chromeInstall)
    .action(async () => report(await hyperframesChromeInstallCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('trace')
    .description(text.trace)
    .action(async () => report(await hyperframesTraceCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('enable')
    .description(text.enable)
    .action(async () => report(await hyperframesEnableCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('disable')
    .description(text.disable)
    .action(async () => report(await hyperframesDisableCommand(hyperframesPorts, dependencies)));
}
