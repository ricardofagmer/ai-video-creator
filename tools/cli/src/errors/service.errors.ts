import { CliError } from './cli.errors.js';

export type ServiceName = 'api' | 'web';

/** `dist/main.js` (api) or the Next binary (web) is missing: the workspace was not built. */
export class ServiceNotBuiltError extends CliError {
  override readonly category = 'dependency';

  constructor(
    readonly service: ServiceName,
    readonly entryPath: string,
  ) {
    super(`O ${service} não está compilado (${entryPath} não existe); rode a instalação ou "pnpm build".`);
    this.name = 'ServiceNotBuiltError';
  }
}

/** Something that is not this studio's recorded process already answers on the port. */
export class ServicePortInUseError extends CliError {
  override readonly category = 'conflict';

  constructor(
    readonly service: ServiceName,
    readonly port: number,
  ) {
    super(`A porta ${port} do ${service} já está em uso por outro processo; libere a porta ou mude a configuração.`);
    this.name = 'ServicePortInUseError';
  }
}

/**
 * The pid file names a live process whose command line is not the one `studio start` launched
 * (pid reuse after a reboot, or a hand-edited file). Nothing is signalled.
 */
export class ServiceProcessMismatchError extends CliError {
  override readonly category = 'conflict';

  constructor(
    readonly service: ServiceName,
    readonly pid: number,
  ) {
    super(`O processo ${pid} registrado para o ${service} não é o que o studio iniciou; nenhum sinal foi enviado.`);
    this.name = 'ServiceProcessMismatchError';
  }
}

export class ServiceStillRunningError extends CliError {
  override readonly category = 'internal';

  constructor(
    readonly service: ServiceName,
    readonly pid: number,
  ) {
    super(`O ${service} (pid ${pid}) não terminou após o pedido de parada.`);
    this.name = 'ServiceStillRunningError';
  }
}

/** The child exited during start; its output is in the service's process log. */
export class ServiceExitedOnStartError extends CliError {
  override readonly category = 'dependency';

  constructor(
    readonly service: ServiceName,
    readonly logFile: string,
  ) {
    super(`O ${service} encerrou logo ao iniciar; veja ${logFile}.`);
    this.name = 'ServiceExitedOnStartError';
  }
}
