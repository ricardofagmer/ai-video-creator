import { formatBytes } from '../output/format.js';
import { type ErrorCategory } from './exit-codes.js';

/**
 * Base of the errors the CLI itself raises at its boundary. They are presentation-layer errors, so
 * their message is the pt-BR text shown to the owner (D16). Messages name variables, ids, ports
 * and pids only; never a key value, never a biometric path.
 */
export abstract class CliError extends Error {
  abstract readonly category: ErrorCategory;
}

/** A `VIDEO_STUDIO_*` variable read at start is malformed; its value is never echoed. */
export class CliConfigurationError extends CliError {
  override readonly category = 'validation';

  constructor(readonly variable: string) {
    super(`A variável ${variable} tem um valor inválido (porta 1024-65535, diferente entre web e api).`);
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

const inputFileMessages: Readonly<Record<InputFileProblem, string>> = {
  'not-found': 'não existe',
  'not-a-file': 'não é um arquivo comum',
  symlink: 'é um link simbólico; informe o arquivo real',
  'too-large': 'é grande demais',
  'invalid-json': 'não é um JSON válido',
};

/** A JSON input file (`--brief`, `--metadata`) failed boundary checks. */
export class InputFileError extends CliError {
  override readonly category = 'validation';

  constructor(
    readonly option: string,
    readonly problem: InputFileProblem,
  ) {
    super(`O arquivo de ${option} ${inputFileMessages[problem]}.`);
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
    super(`O arquivo de ${option} passa do limite de ${formatBytes(limitBytes)}; nada foi importado.`);
    this.name = 'InputFileTooLargeError';
  }
}

export type ImportSourceProblem = 'not-found' | 'symlink' | 'unsupported-type' | 'too-large' | 'mime-unknown';

const importSourceMessages: Readonly<Record<ImportSourceProblem, string>> = {
  'not-found': 'O caminho informado não existe.',
  symlink: 'O caminho é um link simbólico; informe o arquivo ou a pasta real.',
  'unsupported-type': 'O caminho não é um arquivo nem uma pasta.',
  'too-large': 'O conteúdo passa do limite deste tipo; registre por referência (--by-reference).',
  'mime-unknown': 'Não foi possível deduzir o tipo do arquivo; informe --mime.',
};

export class ImportSourceError extends CliError {
  override readonly category = 'validation';

  constructor(readonly problem: ImportSourceProblem) {
    super(importSourceMessages[problem]);
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

const biometricMessages: Readonly<Record<BiometricRefusal, string>> = {
  'flags-missing':
    'Material biométrico só entra por referência: repita com --sensitivity biometric --by-reference (nada é copiado).',
  'sensitivity-mismatch': 'O --sensitivity informado não confere com o campo sensitivity do arquivo de metadados.',
  'registry-unreadable':
    'Não foi possível conferir as referências biométricas do catálogo; a importação foi recusada por segurança.',
};

export class BiometricImportRefusedError extends CliError {
  override readonly category = 'validation';

  constructor(readonly refusal: BiometricRefusal) {
    super(biometricMessages[refusal]);
    this.name = 'BiometricImportRefusedError';
  }
}

export class TerminalRequiredError extends CliError {
  override readonly category = 'validation';

  constructor(readonly command: string) {
    super(`"studio ${command}" precisa de um terminal interativo; rode o comando no Terminal.`);
    this.name = 'TerminalRequiredError';
  }
}

/** The catalog holds more versions than one CLI scan reads; the scan stops instead of truncating. */
export class CatalogScanLimitError extends CliError {
  override readonly category = 'internal';

  constructor(readonly limit: number) {
    super(`O catálogo tem mais de ${limit} versões; a verificação parou antes de concluir.`);
    this.name = 'CatalogScanLimitError';
  }
}
