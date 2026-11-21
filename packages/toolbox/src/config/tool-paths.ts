import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { ConfigError, isErrnoException } from '../errors';

/** A program setting: the variable that may name it and the default name looked up on PATH. */
export interface ExecutableSetting {
  variable: string;
  value: string | undefined;
  defaultName: string;
  searchPath: string | undefined;
}

export interface ResolvedExecutable {
  path: string;
  source: 'setting' | 'path-lookup';
}

/** Codes that mean "no usable program here"; anything else is a real failure and propagates. */
const NOT_A_PROGRAM_CODES: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP']);

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code !== undefined && NOT_A_PROGRAM_CODES.has(error.code)) return false;
    throw error;
  }
}

/** A set program variable must be an absolute path to an executable regular file. */
export function assertAbsoluteExecutable(variable: string, value: string): string {
  if (!isAbsolute(value)) throw new ConfigError(`${variable} must be an absolute path, got "${value}"`);
  if (!isExecutableFile(value)) throw new ConfigError(`${variable} is not an executable file: ${value}`);
  return value;
}

/**
 * The program as one absolute path: the variable when set (absolute required), else the default
 * name found once in an absolute PATH entry. Relative PATH entries are skipped because they would
 * resolve against whatever the working directory happens to be.
 */
export function resolveExecutable(setting: ExecutableSetting): ResolvedExecutable {
  if (setting.value !== undefined) return { path: assertAbsoluteExecutable(setting.variable, setting.value), source: 'setting' };
  for (const directory of (setting.searchPath ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, setting.defaultName);
    if (isExecutableFile(candidate)) return { path: candidate, source: 'path-lookup' };
  }
  throw new ConfigError(
    `${setting.defaultName} was not found on PATH; install it (brew install ffmpeg) or set ${setting.variable} to its absolute path`,
  );
}
