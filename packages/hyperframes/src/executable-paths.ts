import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { HyperframesSandboxUnavailableError } from './errors';

/*
 * Real paths for the sandbox parameters (SPEC 0008 section 17.5, K16, U14, AC 88). The sandbox
 * matches the resolved path of a file, so every path parameter is resolved here before the start.
 * Node only and read-only on the disk: these functions resolve links and check metadata, they never
 * read a file's bytes, list a folder or start a program.
 */

const FORBIDDEN_CHARACTERS = /[\0\r\n]/;

function errorCodeOf(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/** The real path of an executable regular file, or null when `candidate` is not one. */
async function executableRealPath(candidate: string): Promise<string | null> {
  try {
    const realPath = await realpath(candidate);
    const stats = await stat(realPath);
    if (!stats.isFile()) return null;
    await access(realPath, constants.X_OK);
    return realPath;
  } catch {
    // A missing, unreadable or non-executable candidate is not a match; the search goes on and
    // ends in `sandbox-unavailable` when nothing matches.
    return null;
  }
}

/**
 * The real path of the program a render may start (`FFMPEG_BIN`, `FFPROBE_BIN`). An absolute
 * setting resolves to its real path; a bare name is the first executable regular file in the
 * absolute folders of `searchPath`, then its real path. Anything else (a relative path, nothing
 * found, a NUL or line break) throws `HyperframesSandboxUnavailableError`. It never starts the
 * program.
 */
export async function resolveExecutable(nameOrPath: string, searchPath: string): Promise<string> {
  if (nameOrPath.length === 0 || FORBIDDEN_CHARACTERS.test(nameOrPath)) throw new HyperframesSandboxUnavailableError();
  if (isAbsolute(nameOrPath)) {
    const realPath = await executableRealPath(nameOrPath);
    if (realPath === null) throw new HyperframesSandboxUnavailableError();
    return realPath;
  }
  // A relative path with a folder would resolve against the caller's cwd: refused, never guessed.
  if (nameOrPath.includes('/')) throw new HyperframesSandboxUnavailableError();
  for (const folder of searchPath.split(delimiter)) {
    // An empty or relative PATH entry means the cwd; the sandbox needs a path known in advance.
    if (folder.length === 0 || !isAbsolute(folder)) continue;
    const realPath = await executableRealPath(join(folder, nameOrPath));
    if (realPath !== null) return realPath;
  }
  throw new HyperframesSandboxUnavailableError();
}

async function realPathOrMissing(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (error) {
    const code = errorCodeOf(error);
    // Only an absent component lets the walk go one level up; any other failure means the
    // isolation cannot be configured.
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw new HyperframesSandboxUnavailableError();
  }
}

/**
 * The real path of the deepest existing ancestor of `path`, followed by the rest of `path`
 * (`OWNER_HYPERFRAMES_DIR`, a folder that may not exist). Throws
 * `HyperframesSandboxUnavailableError` for a relative path, a NUL or a line break, or a failure
 * other than an absent component. Nothing is read or listed.
 */
export async function realPathOfExistingPrefix(path: string): Promise<string> {
  if (!isAbsolute(path) || FORBIDDEN_CHARACTERS.test(path)) throw new HyperframesSandboxUnavailableError();
  const target = resolve(path);
  let ancestor = target;
  for (;;) {
    const realAncestor = await realPathOrMissing(ancestor);
    if (realAncestor !== null) return join(realAncestor, relative(ancestor, target));
    const parent = dirname(ancestor);
    // The file system root always resolves, so this only guards against an endless walk.
    if (parent === ancestor) throw new HyperframesSandboxUnavailableError();
    ancestor = parent;
  }
}
