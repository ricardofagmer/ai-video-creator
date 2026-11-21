import type { Stats } from 'node:fs';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { InputError, isErrnoException } from '../errors';

const OUTPUT_EXTENSIONS = new Set(['.mp4']);

async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Absolute paths always start with "/", so ffmpeg can never read one as an option ("-y") or as a
 * protocol prefix ("concat:", "http:"). Paths only ever travel as their own argv element. The real
 * path is returned so the tool opens the file that was checked, not whatever a symlink names later.
 */
export async function resolveInputFile(path: string, label: string): Promise<string> {
  const absolute = resolve(path);
  const info = await statOrNull(absolute);
  if (!info) throw new InputError(`${label} does not exist: ${absolute}`);
  if (!info.isFile()) throw new InputError(`${label} is not a regular file: ${absolute}`);
  return realpath(absolute);
}

/** Outputs are new .mp4 files; like the Python tools, nothing is ever overwritten. */
export async function prepareOutputFile(path: string, inputs: readonly string[]): Promise<string> {
  const absolute = resolve(path);
  if (!OUTPUT_EXTENSIONS.has(extname(absolute).toLowerCase())) throw new InputError(`output must be an .mp4 file: ${absolute}`);
  if (inputs.includes(absolute)) throw new InputError(`output must differ from every input: ${absolute}`);
  if (await statOrNull(absolute)) throw new InputError(`output already exists; choose another filename (no overwrite): ${absolute}`);
  await mkdir(dirname(absolute), { recursive: true });
  return absolute;
}
