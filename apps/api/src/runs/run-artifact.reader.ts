import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { RunNotFoundError } from '@studio/core/runs';
import { runArtifactFiles, runArtifactFolders } from '@studio/shared/api';
import { RunFileError, resolveInsideRun, runDirectory } from '@studio/shared/run-files';
import { type RunId } from '@studio/shared/run-format';
import { ArtifactNotFoundError } from '../platform/api.errors';
import { artifactContentTypeOf } from './artifact-content-type';

/** An open artifact; the caller streams it and the stream closes the handle. */
export interface OpenedArtifact {
  handle: FileHandle;
  size: number;
  contentType: string;
  disposition: 'inline' | 'attachment';
  fileName: string;
}

/** Hidden names (`.env`, `.DS_Store`, editor swap files) are never artifacts. */
function isAllowedArtifactPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return false;
  const [first = ''] = segments;
  return segments.length === 1 ? runArtifactFiles.includes(first) : runArtifactFolders.includes(first);
}

function hasErrorCode(error: unknown, ...codes: string[]): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && codes.includes(error.code);
}

async function realpathOrAbsent(path: string): Promise<string | 'absent'> {
  try {
    return await realpath(path);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT', 'ENOTDIR')) return 'absent';
    throw error;
  }
}

/**
 * Serves run outputs read-only (ADR 0003: the api reads run folders, it writes only drafts,
 * control requests and decisions). Every refusal reads as "not found" so the response never
 * tells which files exist outside the allowlist. Biometric reference files live outside the data
 * home (registered by reference), so the containment check below also keeps them out of reach
 * when a run folder holds a link to one.
 */
@Injectable()
export class RunArtifactReader {
  constructor(private readonly dataHome: DataHome) {}

  async open(runId: RunId, relativePath: string): Promise<OpenedArtifact> {
    if (!isAllowedArtifactPath(relativePath)) throw new ArtifactNotFoundError();
    const runDir = runDirectory(this.dataHome.runs, runId);
    const realRunDir = await realpathOrAbsent(runDir);
    if (realRunDir === 'absent') throw new RunNotFoundError(runId);
    const lexical = this.lexicalPath(runDir, relativePath);
    const realTarget = await realpathOrAbsent(lexical);
    if (realTarget === 'absent' || !realTarget.startsWith(`${realRunDir}${sep}`)) throw new ArtifactNotFoundError();
    return this.openRegularFile(realTarget, relativePath);
  }

  private lexicalPath(runDir: string, relativePath: string): string {
    try {
      return resolveInsideRun(runDir, relativePath);
    } catch (error) {
      if (error instanceof RunFileError && error.code === 'path-outside-run') throw new ArtifactNotFoundError();
      throw error;
    }
  }

  /** O_NOFOLLOW refuses a final component swapped for a link between realpath and open. */
  private async openRegularFile(realTarget: string, relativePath: string): Promise<OpenedArtifact> {
    let handle: FileHandle;
    try {
      handle = await open(realTarget, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT', 'ELOOP', 'EISDIR')) throw new ArtifactNotFoundError();
      throw error;
    }
    const stats = await handle.stat().catch(async (error: unknown) => {
      await handle.close();
      throw error;
    });
    if (!stats.isFile()) {
      await handle.close();
      throw new ArtifactNotFoundError();
    }
    // Type and name come from the requested path, whose characters C10 restricts to [A-Za-z0-9._-].
    const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    return { handle, size: stats.size, ...artifactContentTypeOf(fileName), fileName };
  }
}
