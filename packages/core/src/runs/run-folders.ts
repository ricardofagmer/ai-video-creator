import { type Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { RunIdSchema, type RunId } from '@studio/shared/run-format';
import { RunIndexTooLargeError } from './runs.errors';

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function readRunsRoot(runsRoot: string): Promise<Dirent[]> {
  try {
    return await readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
}

/**
 * Names of the run folders under the runs root, sorted. Only directories named by a C3 `RunId`
 * count; anything else in `runs/` is not a run. A missing root holds no runs. More than `limit`
 * folders fails before anything is written, so a rebuild never leaves a partial index.
 */
export async function listRunFolderIds(runsRoot: string, limit: number): Promise<RunId[]> {
  const entries = await readRunsRoot(runsRoot);
  const runIds = entries.filter((entry) => entry.isDirectory() && RunIdSchema.safeParse(entry.name).success).map((entry) => entry.name);
  if (runIds.length > limit) throw new RunIndexTooLargeError(limit);
  return runIds.sort();
}
