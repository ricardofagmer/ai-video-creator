import { type Stats } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { InputFileError } from '../errors/cli.errors.js';

/** A brief or a metadata file is a few KB; this bound keeps a wrong path from being read whole. */
export const MAX_JSON_INPUT_BYTES = 256 * 1024;

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * Reads an owner-supplied JSON file (`--brief`, `--metadata`) at the boundary: a regular file, not
 * a link, at most `MAX_JSON_INPUT_BYTES`, valid JSON. The result is `unknown`; the core handler
 * validates its shape with the frozen zod contracts.
 */
export async function readJsonInputFile(option: string, path: string): Promise<unknown> {
  const absolutePath = resolve(path);
  let stats: Stats;
  try {
    stats = await lstat(absolutePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) throw new InputFileError(option, 'not-found');
    throw error;
  }
  if (stats.isSymbolicLink()) throw new InputFileError(option, 'symlink');
  if (!stats.isFile()) throw new InputFileError(option, 'not-a-file');
  if (stats.size > MAX_JSON_INPUT_BYTES) throw new InputFileError(option, 'too-large');
  const text = await readFile(absolutePath, 'utf8');
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    // The parser message quotes the file content; only the fact is reported.
    throw new InputFileError(option, 'invalid-json');
  }
}
