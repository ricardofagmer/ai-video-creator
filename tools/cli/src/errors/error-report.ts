import { AssetStoreError } from '@studio/core/asset-store';
import { CatalogError } from '@studio/core/catalog';
import { CostsError } from '@studio/core/costs';
import { EmbeddingsError } from '@studio/core/embeddings';
import { InvalidDataHomeError } from '@studio/core/paths';
import { QualityError } from '@studio/core/quality';
import { RecipesError } from '@studio/core/recipes';
import { ReviewError } from '@studio/core/review';
import { RunsError } from '@studio/core/runs';
import { SecretsError } from '@studio/core/secrets';
import { SeedError } from '@studio/core/seed';
import { RunFileError, UnsupportedRunFormatError } from '@studio/shared/run-files';
import { CliError } from './cli.errors.js';
import { describeDomainError } from './domain-messages.js';
import { ExitCode, exitCodeForCategory, type ErrorCategory } from './exit-codes.js';

export interface ErrorReport {
  exitCode: number;
  /** pt-BR text for stderr; never a key value, a biometric path or a stack. */
  message: string;
}

const CATEGORIES: readonly ErrorCategory[] = ['validation', 'not_found', 'conflict', 'dependency', 'internal'];

const categoryLeads: Readonly<Record<ErrorCategory, string>> = {
  validation: 'Pedido inválido',
  not_found: 'Não encontrado',
  conflict: 'Ação recusada pelo estado atual',
  dependency: 'Dependência indisponível',
  internal: 'Erro interno',
};

const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : 'NonErrorThrown';
  return ERROR_NAME_PATTERN.test(name) ? name : 'Error';
}

function categoryOf(error: unknown): ErrorCategory | null {
  if (typeof error !== 'object' || error === null || !('category' in error)) return null;
  const { category } = error;
  return CATEGORIES.find((candidate) => candidate === category) ?? null;
}

/**
 * Core families whose messages are documented as ids/refs/statuses only (no path, no content,
 * no key), so their English text may follow the pt-BR lead as a technical detail.
 */
function hasSafeMessage(error: unknown): error is Error {
  return (
    error instanceof CatalogError ||
    error instanceof RunsError ||
    error instanceof ReviewError ||
    error instanceof RecipesError ||
    error instanceof SeedError ||
    error instanceof CostsError ||
    error instanceof SecretsError ||
    error instanceof AssetStoreError ||
    error instanceof EmbeddingsError ||
    error instanceof QualityError
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isPrismaFailure(error: unknown): boolean {
  return error instanceof Error && error.name.startsWith('PrismaClient');
}

function runFileReport(error: RunFileError): ErrorReport {
  if (error instanceof UnsupportedRunFormatError) {
    return { exitCode: ExitCode.conflict, message: 'Esta execução usa um formato mais novo que este studio; atualize o studio.' };
  }
  return { exitCode: ExitCode.internal, message: `Um arquivo da execução não pôde ser lido (${error.code}).` };
}

/**
 * The one place an error becomes an exit code and a message (typed errors caught once at the
 * command boundary). Unknown errors show their class name only; their text may quote paths.
 */
export function toErrorReport(error: unknown): ErrorReport {
  if (isAbort(error)) return { exitCode: ExitCode.interrupted, message: 'Interrompido.' };
  if (error instanceof CliError) return { exitCode: exitCodeForCategory(error.category), message: error.message };
  if (error instanceof RunFileError) return runFileReport(error);
  if (error instanceof InvalidDataHomeError) {
    return { exitCode: ExitCode.usage, message: `A pasta de dados (VIDEO_STUDIO_HOME) é inválida: ${error.reason}.` };
  }
  if (isPrismaFailure(error)) {
    return {
      exitCode: ExitCode.dependency,
      message: 'Banco de dados indisponível ou sem as migrations; rode scripts/install.sh e depois "studio doctor".',
    };
  }
  const category = categoryOf(error) ?? 'internal';
  const exitCode = exitCodeForCategory(category);
  const known = describeDomainError(error);
  if (known !== null) return { exitCode, message: known };
  const detail = hasSafeMessage(error) ? ` Detalhe: ${error.message}` : ' Rode "studio doctor" para diagnosticar.';
  return { exitCode, message: `${categoryLeads[category]} (${errorName(error)}).${detail}` };
}

/** Class name only, for log lines written before or outside redaction. */
export function errorLabel(error: unknown): string {
  return errorName(error);
}
