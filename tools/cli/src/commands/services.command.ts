import { ExitCode } from '../errors/exit-codes.js';
import { toErrorReport } from '../errors/error-report.js';
import { type ServiceName } from '../errors/service.errors.js';
import { loopbackUrl } from '../doctor/http-probe.js';
import { startService, stopService, type StartOutcome, type StopOutcome } from '../services/service-manager.js';
import { serviceSpec } from '../services/service-spec.js';
import { type CommandDependencies } from './command-dependencies.js';

/** The web calls the api, so the api comes up first and goes down last. */
const START_ORDER: readonly ServiceName[] = ['api', 'web'];
const STOP_ORDER: readonly ServiceName[] = ['web', 'api'];

const SERVICE_LABELS: Readonly<Record<ServiceName, string>> = { api: 'api', web: 'web' };

function startLine(name: ServiceName, outcome: StartOutcome): string {
  const url = loopbackUrl(outcome.port, '/');
  if (outcome.status === 'already-running') return `${SERVICE_LABELS[name]} já estava rodando (pid ${outcome.pid}) em ${url}.`;
  if (outcome.ready) return `${SERVICE_LABELS[name]} iniciado (pid ${outcome.pid}) em ${url}.`;
  return `${SERVICE_LABELS[name]} iniciado (pid ${outcome.pid}), mas ainda não respondeu em ${url}; confira com "studio doctor".`;
}

function stopLine(name: ServiceName, outcome: StopOutcome): string {
  switch (outcome.status) {
    case 'stopped':
      return `${SERVICE_LABELS[name]} parado (pid ${outcome.pid}).`;
    case 'not-running':
      return `${SERVICE_LABELS[name]} não estava rodando.`;
    case 'stale-record-removed':
      return `${SERVICE_LABELS[name]} não estava rodando; registro antigo removido.`;
  }
}

/**
 * `studio start [web|api]` (D9). Without a target the api starts, then the web; the first failure
 * stops the sequence, since a web without its api cannot serve the studio.
 */
export async function startServicesCommand(target: ServiceName | undefined, dependencies: CommandDependencies): Promise<number> {
  const names = target === undefined ? START_ORDER : [target];
  let exitCode: number = ExitCode.ok;
  for (const name of names) {
    const outcome = await startService(serviceSpec(name, dependencies.settings, process.execPath), dependencies.signal);
    dependencies.printer.line(startLine(name, outcome));
    if (outcome.status === 'started' && !outcome.ready) exitCode = ExitCode.dependency;
  }
  return exitCode;
}

/**
 * `studio stop [web|api]` (D9). Without a target the web stops, then the api. Each service is
 * attempted even when the other fails, so one stuck process does not keep the other running.
 */
export async function stopServicesCommand(target: ServiceName | undefined, dependencies: CommandDependencies): Promise<number> {
  const names = target === undefined ? STOP_ORDER : [target];
  let exitCode: number = ExitCode.ok;
  for (const name of names) {
    try {
      const outcome = await stopService(serviceSpec(name, dependencies.settings, process.execPath));
      dependencies.printer.line(stopLine(name, outcome));
    } catch (error) {
      // Handled here, once: the report is printed and the next service is still stopped.
      const report = toErrorReport(error);
      dependencies.printer.error(report.message);
      if (exitCode === ExitCode.ok) exitCode = report.exitCode;
    }
  }
  return exitCode;
}
