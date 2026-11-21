import { HYPERFRAMES_FORMAT_VERSION } from '@studio/shared/hyperframes';
import { writeEngineFile } from '@studio/shared/hyperframes/files';
import { checkLine } from '../doctor/doctor-check.js';
import { ExitCode } from '../errors/exit-codes.js';
import { HYPERFRAMES_CLI_ACTOR } from '../hyperframes/cli-runtime.js';
import { HyperframesStepRefusedError, withHyperframesErrors } from '../hyperframes/hyperframes.errors.js';
import { type HyperframesCliEvent, type HyperframesCommandPorts } from '../hyperframes/hyperframes-ports.js';
import { enableRefusal, hyperframesChecks, readHyperframesStatus } from '../hyperframes/hyperframes-status.js';
import { type Printer } from '../output/printer.js';
import { type CommandDependencies } from './command-dependencies.js';

/*
 * `studio hyperframes status | enable | disable` (SPEC 0008 sections 5.6 and 7). Only `enable`
 * and `disable` write, and only `engine.json`. Nothing here is called by the installer, the seed,
 * the watcher or another command.
 */

/** Records a section 7 event; a failed record is a warning and never undoes the step. */
export async function recordHyperframesEvent(ports: HyperframesCommandPorts, printer: Printer, event: HyperframesCliEvent): Promise<void> {
  try {
    await ports.events.record(event);
  } catch {
    printer.line('[aviso] o evento não foi registrado no log do estúdio; o passo foi concluído.');
  }
}

/** Read-only: pin, Node, sandbox, Chrome, config, trace, engine state and the next owner step. */
export async function hyperframesStatusCommand(ports: HyperframesCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const status = await readHyperframesStatus(dependencies.settings, { now: ports.now(), sandboxAvailable: ports.system.sandboxExecExists() });
  dependencies.printer.line('Situação do motor HyperFrames');
  for (const check of hyperframesChecks(status)) dependencies.printer.line(checkLine(check));
  return ExitCode.ok;
}

/**
 * Owner step O4. Writes `engine.json` `enabled` only when `engineState` would then be `ready` (and
 * the pin and the sandbox are in place); otherwise it names the reason and writes nothing (AC 70).
 */
export async function hyperframesEnableCommand(ports: HyperframesCommandPorts, dependencies: CommandDependencies): Promise<number> {
  return withHyperframesErrors(async () => {
    const { settings, printer } = dependencies;
    const now = ports.now();
    const status = await readHyperframesStatus(settings, { now, sandboxAvailable: ports.system.sandboxExecExists() });
    const refusal = enableRefusal(status);
    if (refusal !== null) throw new HyperframesStepRefusedError(`${refusal} Nada foi gravado.`);
    await writeEngineFile(settings.dataHome.root, {
      format: HYPERFRAMES_FORMAT_VERSION,
      state: 'enabled',
      updatedAt: now.toISOString(),
      updatedBy: HYPERFRAMES_CLI_ACTOR,
    });
    printer.line('Motor HyperFrames ligado. As receitas com modelo HyperFrames passam a renderizar com ele.');
    await recordHyperframesEvent(ports, printer, { event: 'hyperframes.engine-changed', state: 'enabled' });
    return ExitCode.ok;
  });
}

/** Always works: writes `engine.json` `disabled`, whatever the other files say. */
export async function hyperframesDisableCommand(ports: HyperframesCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const { settings, printer } = dependencies;
  await writeEngineFile(settings.dataHome.root, {
    format: HYPERFRAMES_FORMAT_VERSION,
    state: 'disabled',
    updatedAt: ports.now().toISOString(),
    updatedBy: HYPERFRAMES_CLI_ACTOR,
  });
  printer.line('Motor HyperFrames desligado. Nenhuma renderização HyperFrames roda até `studio hyperframes enable`.');
  await recordHyperframesEvent(ports, printer, { event: 'hyperframes.engine-changed', state: 'disabled' });
  return ExitCode.ok;
}
