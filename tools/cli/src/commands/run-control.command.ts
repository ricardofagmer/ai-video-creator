import { RequestRunControlCommand, type RunControlRequest } from '@studio/core/review';
import { type RunId } from '@studio/shared/run-format';
import { ExitCode } from '../errors/exit-codes.js';
import { withCliContext } from '../nest/cli-context.js';
import { type CommandDependencies } from './command-dependencies.js';

export type RunControlKind = RunControlRequest['kind'];

const confirmations: Readonly<Record<RunControlKind, string>> = {
  pause: 'Pausa pedida: a execução para depois do passo atual.',
  stop: 'Parada pedida: o passo atual é interrompido e a execução fica interrompida.',
  resume: 'Retomada pedida: o watcher continua a execução do ponto em que parou.',
};

/**
 * Writes `control.json` through core `RequestRunControlCommand` (C5 helper inside, ADR 0003 writer
 * rules and A6 checks), the same path the api uses, so a pause from here shows in the web and the
 * reverse (criterion 14). Returns the pt-BR confirmation; shared by the commands and the dashboard.
 */
export async function requestRunControl(kind: RunControlKind, runId: RunId): Promise<string> {
  const request: RunControlRequest = { kind };
  await withCliContext((context) => context.commandBus.execute(new RequestRunControlCommand({ runId, request })));
  return `${confirmations[kind]} (${runId})`;
}

/** `studio pause|stop|resume <runId>`. */
export async function runControlCommand(kind: RunControlKind, runId: RunId, dependencies: CommandDependencies): Promise<number> {
  dependencies.printer.line(await requestRunControl(kind, runId));
  return ExitCode.ok;
}
