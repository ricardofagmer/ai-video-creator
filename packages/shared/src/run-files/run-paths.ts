import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { RelativePathSchema, RunIdSchema, type RunId } from '../common/ids';
import { RunFileNotFoundError, RunPathOutsideRunError, hasErrorCode } from './errors';

/** `<runsRoot>/<runId>`; the runs root comes from the data-home paths module (R1-05). */
export function runDirectory(runsRoot: string, runId: RunId): string {
  if (!isAbsolute(runsRoot)) throw new RunPathOutsideRunError(runsRoot, 'runs root must be absolute');
  if (!RunIdSchema.safeParse(runId).success) throw new RunPathOutsideRunError(join(runsRoot, runId), 'invalid runId');
  return join(runsRoot, runId);
}

/** Joins a run-relative path to the run folder and refuses anything that would leave it. */
export function resolveInsideRun(runDir: string, relativePath: string): string {
  if (!isAbsolute(runDir)) throw new RunPathOutsideRunError(runDir, 'run folder must be absolute');
  if (!RelativePathSchema.safeParse(relativePath).success) {
    throw new RunPathOutsideRunError(relativePath, 'not a safe relative path');
  }
  const root = resolve(runDir);
  const target = resolve(root, relativePath);
  if (!target.startsWith(`${root}${sep}`)) throw new RunPathOutsideRunError(target, 'escapes the run folder');
  return target;
}

async function isLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) return false;
    throw error;
  }
}

/**
 * The real path of the deepest existing ancestor of `target` (`target` itself when it exists), with
 * the not-yet-existing tail appended, so a path that is about to be created can be checked too.
 */
async function realPathOf(target: string): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT') && !hasErrorCode(error, 'ENOTDIR')) throw error;
      // A dangling link: a write would follow it and create its target, wherever that is.
      if (await isLink(current)) throw new RunPathOutsideRunError(current, 'a link with a missing target');
      const parent = dirname(current);
      // `resolveInsideRun` already proved the target lies under an existing run folder.
      if (parent === current) throw error;
      missing.push(basename(current));
      current = parent;
    }
  }
}

/**
 * `resolveInsideRun` plus the links on disk (baseline review "symlink check"): every existing
 * segment is resolved with `realpath`, and the result must still lie inside the run folder's own
 * real path, so a link planted inside a run cannot lead a read or write outside it. Returns the
 * real path; a link that stays inside the run folder is allowed. A missing tail (a file about to be
 * written) is checked through its deepest existing ancestor. Only a check at call time: callers that
 * need protection against a swap after the check still open with O_NOFOLLOW themselves.
 */
export async function resolveInsideRunReal(runDir: string, relativePath: string): Promise<string> {
  const lexical = resolveInsideRun(runDir, relativePath);
  let realRoot: string;
  try {
    realRoot = await realpath(resolve(runDir));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) throw new RunFileNotFoundError(runDir, { cause: error });
    throw error;
  }
  const real = await realPathOf(lexical);
  if (!real.startsWith(`${realRoot}${sep}`)) throw new RunPathOutsideRunError(lexical, 'a link leads outside the run folder');
  return real;
}
