import { type ZodIssue } from 'zod';
import { RUN_FORMAT_VERSION } from '../run-format/vocabulary';

export type RunFileErrorCode =
  | 'not-found'
  | 'invalid-json'
  | 'schema-mismatch'
  | 'unsupported-format'
  | 'write-failed'
  | 'path-outside-run'
  | 'append-only-violated';

/**
 * Base of every run-file failure. Messages name the file and the problem, never the file
 * content, so they are safe to log; the api still maps them to generic client errors.
 */
export abstract class RunFileError extends Error {
  abstract readonly code: RunFileErrorCode;

  protected constructor(
    message: string,
    readonly filePath: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class RunFileNotFoundError extends RunFileError {
  override readonly code = 'not-found';

  constructor(filePath: string, options?: ErrorOptions) {
    super(`Run file not found: ${filePath}`, filePath, options);
    this.name = 'RunFileNotFoundError';
  }
}

export class RunFileInvalidJsonError extends RunFileError {
  override readonly code = 'invalid-json';

  constructor(filePath: string, location: string, options?: ErrorOptions) {
    super(`Run file is not valid JSON (${location}): ${filePath}`, filePath, options);
    this.name = 'RunFileInvalidJsonError';
  }
}

export class RunFileSchemaError extends RunFileError {
  override readonly code = 'schema-mismatch';

  constructor(
    filePath: string,
    readonly problems: readonly string[],
  ) {
    super(`Run file does not match its contract: ${filePath}: ${problems.slice(0, 5).join('; ')}`, filePath);
    this.name = 'RunFileSchemaError';
  }
}

/** ADR 0003 decision 5: a reader that meets a higher format number refuses instead of guessing. */
export class UnsupportedRunFormatError extends RunFileError {
  override readonly code = 'unsupported-format';
  readonly supportedFormat = RUN_FORMAT_VERSION;

  constructor(
    filePath: string,
    readonly foundFormat: number,
  ) {
    super(
      `Run format ${foundFormat} is newer than the supported format ${RUN_FORMAT_VERSION}; update the studio: ${filePath}`,
      filePath,
    );
    this.name = 'UnsupportedRunFormatError';
  }
}

export class RunFileWriteError extends RunFileError {
  override readonly code = 'write-failed';

  constructor(filePath: string, options?: ErrorOptions) {
    super(`Could not write run file: ${filePath}`, filePath, options);
    this.name = 'RunFileWriteError';
  }
}

export class RunPathOutsideRunError extends RunFileError {
  override readonly code = 'path-outside-run';

  constructor(filePath: string, reason: string) {
    super(`Refused run path (${reason}): ${filePath}`, filePath);
    this.name = 'RunPathOutsideRunError';
  }
}

/** An append-only file became shorter than a byte offset a reader already consumed. */
export class AppendOnlyViolationError extends RunFileError {
  override readonly code = 'append-only-violated';

  constructor(filePath: string, fromByte: number, size: number) {
    super(`Append-only file shrank below byte ${fromByte} (size ${size}): ${filePath}`, filePath);
    this.name = 'AppendOnlyViolationError';
  }
}

export function describeZodIssues(issues: readonly ZodIssue[]): string[] {
  return issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '<root>'}: ${issue.message}`);
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
