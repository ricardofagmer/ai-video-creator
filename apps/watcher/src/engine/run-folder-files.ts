import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { RunPathOutsideRunError, resolveInsideRun, resolveInsideRunReal } from '@studio/shared/run-files';
import { type Sha256 } from '@studio/shared/run-format';

/**
 * Read-only inspection of files inside a run folder. Every path goes through
 * `resolveInsideRunReal`, so nothing here can look outside the run (C5), not even through a link an
 * executor left inside it (baseline review "symlink check").
 */

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export type RunFileProbe = { status: 'file'; sizeBytes: number } | { status: 'absent' } | { status: 'not-a-file' };

/** The real path, or null for a link that leads outside the run folder; an unsafe relative path still throws. */
async function realInsideRun(runDir: string, relativePath: string): Promise<string | null> {
  resolveInsideRun(runDir, relativePath);
  try {
    return await resolveInsideRunReal(runDir, relativePath);
  } catch (error) {
    // The lexical check above passed, so this refusal is about a link on disk.
    if (error instanceof RunPathOutsideRunError) return null;
    throw error;
  }
}

/** A link that leads outside the run folder is `not-a-file`: the output is not in the run. */
export async function probeRunPath(runDir: string, relativePath: string): Promise<RunFileProbe> {
  const realPath = await realInsideRun(runDir, relativePath);
  if (realPath === null) return { status: 'not-a-file' };
  try {
    const info = await stat(realPath);
    return info.isFile() ? { status: 'file', sizeBytes: info.size } : { status: 'not-a-file' };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return { status: 'absent' };
    throw error;
  }
}

export async function isRunDirectory(runDir: string, relativePath: string): Promise<boolean> {
  const realPath = await realInsideRun(runDir, relativePath);
  if (realPath === null) return false;
  try {
    return (await stat(realPath)).isDirectory();
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/** File names directly inside a run-relative folder; an absent folder lists as empty. */
export async function listRunDirectory(runDir: string, relativePath: string): Promise<string[]> {
  try {
    const entries = await readdir(await resolveInsideRunReal(runDir, relativePath), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return [];
    throw error;
  }
}

/** Streams the file so large outputs (final.mp4) are hashed without loading them whole. */
export async function sha256OfRunFile(runDir: string, relativePath: string): Promise<Sha256> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(await resolveInsideRunReal(runDir, relativePath))) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
