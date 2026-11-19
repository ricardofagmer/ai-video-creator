import { realpath } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { AbsolutePathSchema } from '@studio/shared/catalog';
import { SourceNotFoundError, UnsafePathError } from './asset-store.errors';

/** True when `candidate` is `root` itself or lies below it, compared after `resolve`. */
export function isInsideOrEqual(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (resolvedCandidate === resolvedRoot) return true;
  const offset = relative(resolvedRoot, resolvedCandidate);
  // `..x` is a child named "..x"; only a bare `..` segment means "outside".
  return offset !== '' && offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

/** Joins and refuses any result that leaves `root` (store blobs, temp files, folder entries). */
export function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, relativePath);
  if (!target.startsWith(`${resolvedRoot}${sep}`)) throw new UnsafePathError('escapes-root');
  return target;
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function realpathOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return resolve(path);
    throw error;
  }
}

/**
 * Validates a caller-supplied source path: a by-reference registration or a CLI import (PRD 5.3).
 * The path must be absolute and normalized with no `.` or `..` segment, must exist, and must not
 * lie inside the content store, lexically or after following symlinks. Returns the real path,
 * which the caller reads; the caller records the path exactly as supplied.
 */
export async function assertSafeSourcePath(candidate: string, storeRoot: string): Promise<string> {
  if (typeof candidate !== 'string' || !isAbsolute(candidate)) throw new UnsafePathError('not-absolute');
  // C1 AbsolutePathSchema refuses NUL and `.`/`..` segments; normalize() catches `//` and the rest.
  const hasTrailingSeparator = candidate.length > 1 && candidate.endsWith(sep);
  if (!AbsolutePathSchema.safeParse(candidate).success || normalize(candidate) !== candidate || hasTrailingSeparator) {
    throw new UnsafePathError('not-normalized');
  }
  if (isInsideOrEqual(storeRoot, candidate)) throw new UnsafePathError('inside-store');

  let realCandidate: string;
  try {
    realCandidate = await realpath(candidate);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') throw new SourceNotFoundError();
    throw error;
  }
  if (isInsideOrEqual(await realpathOrSelf(storeRoot), realCandidate)) throw new UnsafePathError('inside-store');
  return realCandidate;
}
