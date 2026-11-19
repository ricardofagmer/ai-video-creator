import { lstat, realpath } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { isInsideOrEqual } from '@studio/core/asset-store';
import { DataHome } from '@studio/core/paths';
import { type AssetLayout } from '@studio/shared/catalog';
import { ReferencePathRefusedError } from '../platform/api.errors';
import { RequestContext } from '../platform/request-context';
import { ReferenceRoots } from './reference-roots';

/** Step names of SPEC 0002 rev 4, section 13.4, logged on refusal; never sent to the client. */
type ReferencePathStep = 'realpath' | 'exists' | 'kind' | 'data-home' | 'allowed-root';

/** True when `candidate` lies strictly below `root` (equal is not below). */
function isStrictlyInside(root: string, candidate: string): boolean {
  return candidate !== root && isInsideOrEqual(root, candidate);
}

function hasHiddenSegment(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

function errnoCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/**
 * Steps 2 to 6 of the by-reference path validation (SPEC 0002 rev 4, section 13.4, A24); step 1,
 * the shape, is the C10 schema at the controller edge (400). Every refusal here is the one
 * `ReferencePathRefusedError` (422 `reference-path-refused`), so the answer is no oracle for which
 * check failed; the failed step is logged by name with the correlation id, never with the path.
 *
 * The target is touched with `realpath` and `lstat` only: it is never opened, read, listed or
 * hashed here (R4-08). The lexical checks of steps 5 and 6 run on the supplied path before any
 * file-system call, so a path outside the allowed roots is refused without being probed; the
 * accepted and refused sets equal the spec's ordered list, because the resolved path must equal the
 * supplied one (step 2) and is checked again after resolution.
 */
@Injectable()
export class ReferencePathValidator {
  private readonly logger = new Logger(ReferencePathValidator.name);

  constructor(
    private readonly dataHome: DataHome,
    private readonly roots: ReferenceRoots,
    private readonly context: RequestContext,
  ) {}

  /** Returns the layout the target implies; core still checks it against the kind (step 4). */
  async validate(absolutePath: string): Promise<AssetLayout> {
    const [homeRoot, dataHomeRoots] = await Promise.all([this.realHomeDirectory(), this.dataHomeRoots()]);
    this.assertLexical(absolutePath, homeRoot, dataHomeRoots);
    const resolved = await this.resolve(absolutePath);
    // Step 2: a symlink in any component (including the last) makes the resolved path differ.
    if (resolved !== absolutePath) this.refuse('realpath');
    this.assertLexical(resolved, homeRoot, dataHomeRoots);
    return this.layoutOf(absolutePath);
  }

  /** Steps 5 and 6 on one path: outside the whole data home, below home or `/Volumes/`, no dot segment. */
  private assertLexical(path: string, homeRoot: string, dataHomeRoots: readonly string[]): void {
    // A folder that contains the data home would hash its database and store, so an ancestor is refused too.
    if (dataHomeRoots.some((root) => isInsideOrEqual(root, path) || isInsideOrEqual(path, root))) this.refuse('data-home');
    const underAllowedRoot = isStrictlyInside(homeRoot, path) || isStrictlyInside(this.roots.volumesRoot, path);
    if (!underAllowedRoot || hasHiddenSegment(path)) this.refuse('allowed-root');
  }

  /** Steps 2 and 3: any failure to resolve (missing, a dangling link, no permission) refuses. */
  private async resolve(path: string): Promise<string> {
    try {
      return await realpath(path);
    } catch (error) {
      const code = errnoCode(error);
      return this.refuse(code === 'ENOENT' || code === 'ENOTDIR' ? 'exists' : 'realpath');
    }
  }

  /** Step 4: a regular file or a directory, nothing else (no socket, device, FIFO or link). */
  private async layoutOf(path: string): Promise<AssetLayout> {
    let isFile: boolean;
    let isDirectory: boolean;
    try {
      const stats = await lstat(path);
      isFile = stats.isFile();
      isDirectory = stats.isDirectory();
    } catch {
      // Removed or replaced between realpath and lstat: refused like a missing path.
      return this.refuse('exists');
    }
    if (isFile) return 'file';
    if (isDirectory) return 'folder';
    return this.refuse('kind');
  }

  /** The home folder as resolved, so a home reached through a link still compares with realpaths. */
  private async realHomeDirectory(): Promise<string> {
    return realpath(this.roots.homeDirectory).catch(() => this.roots.homeDirectory);
  }

  /** The data home as configured and as resolved; a path matching either is refused. */
  private async dataHomeRoots(): Promise<readonly string[]> {
    const resolved = await realpath(this.dataHome.root).catch(() => this.dataHome.root);
    return resolved === this.dataHome.root ? [this.dataHome.root] : [this.dataHome.root, resolved];
  }

  private refuse(step: ReferencePathStep): never {
    this.logger.warn({ event: 'catalog.reference-path-refused', step, correlationId: this.context.correlationId() });
    throw new ReferencePathRefusedError();
  }
}
