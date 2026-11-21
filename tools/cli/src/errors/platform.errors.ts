import { CliError } from './cli.errors.js';

/**
 * A publish or gate request the CLI refuses before calling core, with the pt-BR text core would
 * answer (SPEC 0007 section 4.4). Nothing was written. The message names platforms and modes only.
 */
export class PlatformRequestRefusedError extends CliError {
  override readonly category = 'conflict';

  constructor(message: string) {
    super(message);
    this.name = 'PlatformRequestRefusedError';
  }
}

/** The owner did not type the confirmation phrase of `studio runs publish`; nothing was requested. */
export class PublishNotConfirmedError extends CliError {
  override readonly category = 'validation';

  constructor() {
    super('Confirmação diferente: nenhum pedido de publicação foi feito.');
    this.name = 'PublishNotConfirmedError';
  }
}
