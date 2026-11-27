import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { type ToolRunnerRequest } from '../tool-runner.protocol';

/**
 * Real-path confinement of every file a tool-runner request names. Outputs must land inside a write
 * root (the stage scratch folder root); inputs must sit inside a read root (the scratch root plus
 * whatever the caller names, such as the run folder or a bound catalog file). `read: null` means
 * the caller named no read roots, so inputs are resolved but not confined.
 */
export interface RunnerRoots {
  read: readonly string[] | null;
  write: readonly string[];
}

type ConfinementReason = 'outside-roots' | 'missing' | 'exists' | 'not-a-directory';

/** The message names the field and the reason only; the path stays out of run files. */
export class PathConfinementError extends Error {
  constructor(
    readonly field: string,
    readonly reason: ConfinementReason,
  ) {
    super(`tool-runner path refused: ${field} (${reason})`);
    this.name = 'PathConfinementError';
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function realOrRefuse(field: string, path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) throw new PathConfinementError(field, 'missing');
    throw error;
  }
}

function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function assertInside(field: string, path: string, roots: readonly string[]): void {
  if (!roots.some((root) => isInside(path, root))) throw new PathConfinementError(field, 'outside-roots');
}

/** Every root as its real path; a root that does not exist refuses the whole request. */
export async function realRunnerRoots(roots: RunnerRoots): Promise<RunnerRoots> {
  const resolveAll = (list: readonly string[], field: string): Promise<string[]> => Promise.all(list.map((root) => realOrRefuse(field, root)));
  return {
    read: roots.read === null ? null : await resolveAll(roots.read, 'read-root'),
    write: await resolveAll(roots.write, 'write-root'),
  };
}

/** An existing input, as its real path, inside a read root. */
export async function confineReadPath(field: string, path: string, roots: RunnerRoots): Promise<string> {
  const real = await realOrRefuse(field, path);
  if (roots.read !== null) assertInside(field, real, roots.read);
  return real;
}

/** An existing folder the tool writes into, as its real path, inside a write root. */
export async function confineWriteDirectory(field: string, path: string, roots: RunnerRoots): Promise<string> {
  const real = await realOrRefuse(field, path);
  if (!(await lstat(real)).isDirectory()) throw new PathConfinementError(field, 'not-a-directory');
  assertInside(field, real, roots.write);
  return real;
}

/**
 * A new output file: its folder's real path must be inside a write root and nothing may exist at
 * the target yet (no overwrite, no pre-planted symlink).
 */
export async function confineWritePath(field: string, path: string, roots: RunnerRoots): Promise<string> {
  const parent = await realOrRefuse(field, dirname(path));
  assertInside(field, parent, roots.write);
  const target = join(parent, basename(path));
  try {
    await lstat(target);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return target;
    throw error;
  }
  throw new PathConfinementError(field, 'exists');
}

/** The request with every path replaced by its confined real path. */
export async function confineRequest(request: ToolRunnerRequest, roots: RunnerRoots): Promise<ToolRunnerRequest> {
  const read = (field: string, path: string): Promise<string> => confineReadPath(field, path, roots);
  const write = (field: string, path: string): Promise<string> => confineWritePath(field, path, roots);
  switch (request.command) {
    case 'media-review':
      return { ...request, input: await read('input', request.input) };
    case 'music-bed':
      return { ...request, input: await read('input', request.input), music: await read('music', request.music), output: await write('output', request.output) };
    case 'fades':
      return { ...request, input: await read('input', request.input), output: await write('output', request.output) };
    case 'caption-burn':
      return { ...request, input: await read('input', request.input), srt: await read('srt', request.srt), output: await write('output', request.output) };
    case 'render':
      return {
        ...request,
        serveRoot: await read('serveRoot', request.serveRoot),
        output: await write('output', request.output),
        thumbnail: await write('thumbnail', request.thumbnail),
      };
    case 'slate-render':
      return { ...request, audio: await read('audio', request.audio), output: await write('output', request.output) };
    case 'test-capture':
    case 'live-capture':
    case 'page-screenshot':
      return { ...request, output: await write('output', request.output) };
    case 'page-text':
      return request;
    case 'narration-assemble': {
      const clips = [];
      for (const clip of request.clips) clips.push({ ...clip, path: await read('clips.path', clip.path) });
      return { ...request, clips, output: await write('output', request.output) };
    }
    case 'hyperframes-render': {
      let background = request.background;
      if (background !== undefined) {
        const segments = [];
        for (const segment of background.segments) {
          segments.push({ ...segment, source: segment.source === null ? null : await read('background.segments.source', segment.source) });
        }
        background = { ...background, segments };
      }
      return {
        ...request,
        ...(background === undefined ? {} : { background }),
        templateDir: await read('templateDir', request.templateDir),
        audio: await read('audio', request.audio),
        output: await write('output', request.output),
        scratchDir: await confineWriteDirectory('scratchDir', request.scratchDir, roots),
      };
    }
  }
}
