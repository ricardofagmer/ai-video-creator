import { isAbsolute, join, resolve, sep } from 'node:path';
import { RelativePathSchema, RunIdSchema, type RunId } from '../common/ids';
import { RunPathOutsideRunError } from './errors';

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
