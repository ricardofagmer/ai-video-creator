import { cliText } from '../i18n/messages.js';
import { CliError } from './cli.errors.js';

export type ServiceName = 'api' | 'web';

/** `dist/main.js` (api) or the Next binary (web) is missing: the workspace was not built. */
export class ServiceNotBuiltError extends CliError {
  override readonly category = 'dependency';

  constructor(
    readonly service: ServiceName,
    readonly entryPath: string,
  ) {
    super(cliText().errors.service.notBuilt(service, entryPath));
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
    super(cliText().errors.service.portInUse(service, port));
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
    super(cliText().errors.service.processMismatch(service, pid));
    this.name = 'ServiceProcessMismatchError';
  }
}

export class ServiceStillRunningError extends CliError {
  override readonly category = 'internal';

  constructor(
    readonly service: ServiceName,
    readonly pid: number,
  ) {
    super(cliText().errors.service.stillRunning(service, pid));
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
    super(cliText().errors.service.exitedOnStart(service, logFile));
    this.name = 'ServiceExitedOnStartError';
  }
}
