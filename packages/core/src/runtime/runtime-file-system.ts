import { statSync } from 'node:fs';
import { type RuntimeFileSystem } from './studio-runtime';

/** Codes that mean "no usable folder here"; anything else is a real failure and propagates. */
const NOT_A_FOLDER_CODES: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP']);

function hasErrorCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

/** The real file system, for composition roots; tests pass their own `RuntimeFileSystem`. */
export const nodeRuntimeFileSystem: RuntimeFileSystem = {
  isDirectory(path: string): boolean {
    try {
      return statSync(path).isDirectory();
    } catch (error) {
      if (hasErrorCode(error) && NOT_A_FOLDER_CODES.has(error.code)) return false;
      throw error;
    }
  },
};
