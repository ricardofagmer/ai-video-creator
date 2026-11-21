import { type Command } from 'commander';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { hyperframesChromeInstallCommand } from '../commands/hyperframes-chrome.command.js';
import { hyperframesTraceCommand } from '../commands/hyperframes-trace.command.js';
import { hyperframesDisableCommand, hyperframesEnableCommand, hyperframesStatusCommand } from '../commands/hyperframes.command.js';
import { hyperframesPorts } from '../hyperframes/real-ports.js';

type ExitCodeSink = (code: number) => void;

/**
 * `studio hyperframes` (SPEC 0008 sections 5.5 to 5.7). None of these subcommands takes an option:
 * commander refuses unknown flags, so no flag can supply the typed confirmations of `chrome
 * install` and `trace` (AC 69).
 */
export function addHyperframesCommands(program: Command, dependencies: CommandDependencies, report: ExitCodeSink): void {
  const hyperframes = program.command('hyperframes').description('motor HyperFrames: situação, Chrome, verificação de rede, ligar e desligar');
  hyperframes
    .command('status')
    .description('mostra versão, Node, isolamento, Chrome, configuração, verificação, estado do motor e o próximo passo')
    .action(async () => report(await hyperframesStatusCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('chrome')
    .description('Chrome do HyperFrames')
    .command('install')
    .description('baixa o Chrome fixado para a pasta do estúdio (só no Terminal, com a versão digitada)')
    .action(async () => report(await hyperframesChromeInstallCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('trace')
    .description('verifica, dentro do isolamento, que a renderização não acessa a rede (só no Terminal, com confirmação digitada)')
    .action(async () => report(await hyperframesTraceCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('enable')
    .description('liga o motor, só quando Chrome, configuração e uma verificação aprovada estão em dia')
    .action(async () => report(await hyperframesEnableCommand(hyperframesPorts, dependencies)));
  hyperframes
    .command('disable')
    .description('desliga o motor (sempre funciona)')
    .action(async () => report(await hyperframesDisableCommand(hyperframesPorts, dependencies)));
}
