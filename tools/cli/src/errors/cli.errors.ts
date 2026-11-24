import { cliText } from '../i18n/messages.js';
import { formatBytes } from '../output/format.js';
import { type ErrorCategory } from './exit-codes.js';

/**
 * Base of the errors the CLI itself raises at its boundary. They are presentation-layer errors, so
 * their message is the text shown to the owner, in the active language, built in the constructor
 * (which runs after `main` set the language). Messages name variables, ids, ports
 * and pids only; never a key value, never a biometric path.
 */
export abstract class CliError extends Error {
  abstract readonly category: ErrorCategory;
}

/** A `ENGINEOS_VIDEO_CREATOR_*` variable read at start is malformed; its value is never echoed. */
export class CliConfigurationError extends CliError {
  override readonly category = 'validation';

  constructor(readonly variable: string) {
    super(cliText().errors.configuration(variable));
    this.name = 'CliConfigurationError';
  }
}

export class CliUsageError extends CliError {
  override readonly category = 'validation';

  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export type InputFileProblem = 'not-found' | 'not-a-file' | 'symlink' | 'too-large' | 'invalid-json';

/** A JSON input file (`--brief`, `--metadata`) failed boundary checks. */
export class InputFileError extends CliError {
  override readonly category = 'validation';

  constructor(
    readonly option: string,
    readonly problem: InputFileProblem,
  ) {
    const text = cliText().errors.inputFile;
    super(text.sentence(option, text.problems[problem]));
    this.name = 'InputFileError';
  }
}

/**
 * An input file read under a byte cap (`metrics import`) is over the cap: refused from its size,
 * before or while reading, so the rest is never read. The file name is never echoed (SPEC 0006 K7).
 */
export class InputFileTooLargeError extends CliError {
  override readonly category = 'validation';

  constructor(
    readonly option: string,
    readonly limitBytes: number,
  ) {
    super(cliText().errors.inputFile.tooLarge(option, formatBytes(limitBytes)));
    this.name = 'InputFileTooLargeError';
  }
}

export type ImportSourceProblem = 'not-found' | 'symlink' | 'unsupported-type' | 'too-large' | 'mime-unknown';

export class ImportSourceError extends CliError {
  override readonly category = 'validation';

  constructor(readonly problem: ImportSourceProblem) {
    super(cliText().errors.importSource[problem]);
    this.name = 'ImportSourceError';
  }
}

/**
 * Why `catalog import` refuses material that is or may be biometric (PRD 12, criterion 22):
 * - `flags-missing`: it is biometric, and `--sensitivity biometric --by-reference` was not given;
 * - `sensitivity-mismatch`: the flag and the metadata file disagree on the sensitivity;
 * - `registry-unreadable`: the registered biometric references could not all be read, so the
 *   CLI cannot rule the source out and fails closed.
 */
export type BiometricRefusal = 'flags-missing' | 'sensitivity-mismatch' | 'registry-unreadable';

export class BiometricImportRefusedError extends CliError {
  override readonly category = 'validation';

  constructor(readonly refusal: BiometricRefusal) {
    super(cliText().errors.biometric[refusal]);
    this.name = 'BiometricImportRefusedError';
  }
}

export class TerminalRequiredError extends CliError {
  override readonly category = 'validation';

  constructor(readonly command: string) {
    super(cliText().errors.terminalRequired(command));
    this.name = 'TerminalRequiredError';
  }
}

/** The catalog holds more versions than one CLI scan reads; the scan stops instead of truncating. */
export class CatalogScanLimitError extends CliError {
  override readonly category = 'internal';

  constructor(readonly limit: number) {
    super(cliText().errors.catalogScanLimit(limit));
    this.name = 'CatalogScanLimitError';
  }
}
