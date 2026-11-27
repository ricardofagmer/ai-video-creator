import { AssetStoreError } from '@studio/core/asset-store';
import { CatalogError } from '@studio/core/catalog';
import { CostsError } from '@studio/core/costs';
import { EmbeddingsError } from '@studio/core/embeddings';
import { MetricsError } from '@studio/core/metrics';
import { InvalidDataHomeError } from '@studio/core/paths';
import { PlatformError } from '@studio/core/platforms';
import { QualityError } from '@studio/core/quality';
import { RecipesError } from '@studio/core/recipes';
import { ReviewError } from '@studio/core/review';
import { InvalidRuntimeDirectoryError } from '@studio/core/runtime';
import { RunsError } from '@studio/core/runs';
import { ScheduleError } from '@studio/core/schedules';
import { SecretsError } from '@studio/core/secrets';
import { SeedError } from '@studio/core/seed';
import { RunFileError, UnsupportedRunFormatError } from '@studio/shared/run-files';
import { cliText } from '../i18n/messages.js';
import { CliError } from './cli.errors.js';
import { describeDomainError } from './domain-messages.js';
import { ExitCode, exitCodeForCategory, type ErrorCategory } from './exit-codes.js';

export interface ErrorReport {
  exitCode: number;
  /** Text for stderr in the active language; never a key value, a biometric path or a stack. */
  message: string;
}

const CATEGORIES: readonly ErrorCategory[] = ['validation', 'not_found', 'conflict', 'dependency', 'internal'];

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
 * no key), so their English text may follow the translated lead as a technical detail.
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
    error instanceof QualityError ||
    error instanceof ScheduleError ||
    error instanceof MetricsError ||
    error instanceof PlatformError
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isPrismaFailure(error: unknown): boolean {
  return error instanceof Error && error.name.startsWith('PrismaClient');
}

function runFileReport(error: RunFileError): ErrorReport {
  const text = cliText().errors.report;
  if (error instanceof UnsupportedRunFormatError) return { exitCode: ExitCode.conflict, message: text.newerRunFormat };
  return { exitCode: ExitCode.internal, message: text.runFileUnreadable(error.code) };
}

/**
 * The one place an error becomes an exit code and a message (typed errors caught once at the
 * command boundary). Unknown errors show their class name only; their text may quote paths.
 */
export function toErrorReport(error: unknown): ErrorReport {
  const text = cliText().errors.report;
  if (isAbort(error)) return { exitCode: ExitCode.interrupted, message: text.interrupted };
  if (error instanceof CliError) return { exitCode: exitCodeForCategory(error.category), message: error.message };
  if (error instanceof RunFileError) return runFileReport(error);
  if (error instanceof InvalidDataHomeError) return { exitCode: ExitCode.usage, message: text.invalidDataHome(error.reason) };
  if (error instanceof InvalidRuntimeDirectoryError) return { exitCode: ExitCode.usage, message: text.invalidRuntimeDirectory(error.reason) };
  if (isPrismaFailure(error)) return { exitCode: ExitCode.dependency, message: text.databaseUnavailable };
  const category = categoryOf(error) ?? 'internal';
  const exitCode = exitCodeForCategory(category);
  const known = describeDomainError(error);
  if (known !== null) return { exitCode, message: known };
  const detail = hasSafeMessage(error) ? text.detail(error.message) : text.runDoctor;
  return { exitCode, message: `${text.categories[category]} (${errorName(error)}).${detail}` };
}

/** Class name only, for log lines written before or outside redaction. */
export function errorLabel(error: unknown): string {
  return errorName(error);
}
