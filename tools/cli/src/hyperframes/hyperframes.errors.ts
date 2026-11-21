import {
  HyperframesChromeMissingError,
  HyperframesPinMismatchError,
  HyperframesProcessFailedError,
  HyperframesRuntimeError,
} from '@studio/hyperframes';
import { type HyperframesEngineState } from '@studio/shared/hyperframes';
import { CliError } from '../errors/cli.errors.js';
import { type ErrorCategory } from '../errors/exit-codes.js';
import { chromeMissingText, engineStateNextStep, engineStateReason, pinMismatchText, runtimeFailureText } from './hyperframes-texts.js';

/*
 * The pt-BR errors of `studio hyperframes`. Messages hold reason texts, versions and exit codes
 * only (SPEC 0008 K12): never a path, a variable value or child output.
 */

/** A step the current state does not allow; nothing was written. */
export class HyperframesStepRefusedError extends CliError {
  override readonly category = 'conflict';

  constructor(message: string) {
    super(message);
    this.name = 'HyperframesStepRefusedError';
  }

  static forState(state: Exclude<HyperframesEngineState, 'ready'>): HyperframesStepRefusedError {
    return new HyperframesStepRefusedError(`${engineStateReason(state)} ${engineStateNextStep(state)} Nada foi gravado.`);
  }
}

/** The typed confirmation did not match; nothing was started or written. */
export class HyperframesConfirmationError extends CliError {
  override readonly category = 'validation';

  constructor() {
    super('A confirmação digitada não confere; nada foi iniciado nem gravado.');
    this.name = 'HyperframesConfirmationError';
  }
}

/** A runtime failure of `@studio/hyperframes`, carried to the CLI boundary with its pt-BR text. */
export class HyperframesCommandError extends CliError {
  constructor(
    override readonly category: ErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'HyperframesCommandError';
  }
}

/** Maps a runtime error to its pt-BR CLI error; any other error is returned unchanged. */
export function toHyperframesCliError(error: unknown): unknown {
  if (error instanceof HyperframesPinMismatchError) return new HyperframesCommandError('dependency', pinMismatchText(error.detail));
  if (error instanceof HyperframesChromeMissingError) return new HyperframesCommandError('conflict', chromeMissingText(error.detail));
  if (!(error instanceof HyperframesRuntimeError)) return error;
  const { reason } = error;
  if (reason === 'pin-mismatch' || reason === 'chrome-missing') {
    // Only the subclasses above carry these reasons; a bare instance has no detail to show.
    return new HyperframesCommandError('internal', 'Falha interna do motor HyperFrames.');
  }
  const exitSuffix = error instanceof HyperframesProcessFailedError ? ` (código ${error.exitCode})` : '';
  return new HyperframesCommandError('dependency', `${runtimeFailureText(reason)}${exitSuffix}`);
}

/** Runs a command body and converts runtime errors on the way out. */
export async function withHyperframesErrors<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    throw toHyperframesCliError(error);
  }
}
