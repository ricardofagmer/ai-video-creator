import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type Sha256 } from '@studio/shared/run-format';

/**
 * Read-only inspection of files inside a run folder. Every path goes through
 * `resolveInsideRun`, so nothing here can look outside the run (C5).
 */

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export type RunFileProbe = { status: 'file'; sizeBytes: number } | { status: 'absent' } | { status: 'not-a-file' };

export async function probeRunPath(runDir: string, relativePath: string): Promise<RunFileProbe> {
  try {
    const info = await stat(resolveInsideRun(runDir, relativePath));
    return info.isFile() ? { status: 'file', sizeBytes: info.size } : { status: 'not-a-file' };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return { status: 'absent' };
    throw error;
  }
}

export async function isRunDirectory(runDir: string, relativePath: string): Promise<boolean> {
  try {
    return (await stat(resolveInsideRun(runDir, relativePath))).isDirectory();
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/** File names directly inside a run-relative folder; an absent folder lists as empty. */
export async function listRunDirectory(runDir: string, relativePath: string): Promise<string[]> {
  try {
    const entries = await readdir(resolveInsideRun(runDir, relativePath), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return [];
    throw error;
  }
}

/** Streams the file so large outputs (final.mp4) are hashed without loading them whole. */
export async function sha256OfRunFile(runDir: string, relativePath: string): Promise<Sha256> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolveInsideRun(runDir, relativePath))) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
