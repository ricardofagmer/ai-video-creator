import { realpath, stat } from 'node:fs/promises';
import { type FolderFileSource, type FolderReader, type FolderVersionSource, type ListFolderOptions } from '@studio/core/asset-store';
import { type DataHome } from '@studio/core/paths';
import { locateSandboxStudioRoot, type StudioRuntime } from '@studio/core/runtime';
import {
  pinnedBinPath,
  realPathOfExistingPrefix,
  resolveExecutable,
  sandboxExecExists,
  sandboxProfile,
  verifyChromeBinary,
  workspaceRoot,
  type RecordedChromeBinary,
} from '@studio/hyperframes';
import { type HyperframesEngineFiles } from '@studio/shared/hyperframes';
import { readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';

/** A folder the render needs: its real path, or `missing` when it or a parent is absent or not a folder. */
export type RealFolder = { status: 'present'; realPath: string } | { status: 'missing' };

/**
 * What the composition stage needs to start a HyperFrames render (SPEC 0008 sections 4.5, 5.2 and
 * 17.5), as one port so tests answer it without the disk, the pinned package or `sandbox-exec`.
 * The watcher only reads `<data home>/hyperframes/`; it never writes there (B6). Every member is
 * read-only on the disk: none starts a process.
 */
export interface HyperframesStagePorts {
  dataHomeRoot: string;
  readEngineFiles(dataHomeRoot: string): Promise<HyperframesEngineFiles>;
  /** Throws `HyperframesPinMismatchError` when the installed package is not the pin. */
  pinnedBinPath(): string;
  sandboxProfile(): { path: string; sha256: string };
  sandboxExecExists(): boolean;
  listTemplateFiles(source: FolderVersionSource, options: ListFolderOptions): Promise<FolderFileSource[]>;
  /** Section 17.6: throws `HyperframesChromeMissingError` when the binary no longer matches `chrome.json`. */
  verifyChromeBinary(recorded: RecordedChromeBinary, options: { cacheDir: string }): Promise<void>;
  /** Section 17.5: throws `HyperframesSandboxUnavailableError` when nothing executable is found. */
  resolveExecutable(nameOrPath: string, searchPath: string): Promise<string>;
  /** Throws `HyperframesSandboxUnavailableError` when the prefix cannot be resolved. */
  realPathOfExistingPrefix(path: string): Promise<string>;
  /** The real path of an existing file or folder; throws the file system error otherwise. */
  realPath(path: string): Promise<string>;
  /** Throws only for a failure other than an absent component or a non-folder. */
  realFolder(path: string): Promise<RealFolder>;
  /**
   * `STUDIO_ROOT` before resolution: the monorepo root in development, the app's runtime folder
   * when packaged (the sandbox denies `.env` reads under it).
   */
  studioRoot(): string;
}

function errorCodeOf(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

async function realFolder(path: string): Promise<RealFolder> {
  try {
    const realPath = await realpath(path);
    return (await stat(realPath)).isDirectory() ? { status: 'present', realPath } : { status: 'missing' };
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') return { status: 'missing' };
    throw error;
  }
}

export function realHyperframesStagePorts(dataHome: DataHome, folders: FolderReader, runtime: StudioRuntime): HyperframesStagePorts {
  return {
    dataHomeRoot: dataHome.root,
    readEngineFiles: readHyperframesEngineFiles,
    pinnedBinPath,
    sandboxProfile,
    sandboxExecExists,
    listTemplateFiles: (source, options) => folders.listFiles(source, options),
    verifyChromeBinary,
    resolveExecutable,
    realPathOfExistingPrefix,
    realPath: (path) => realpath(path),
    realFolder,
    studioRoot: () => locateSandboxStudioRoot(runtime, workspaceRoot()),
  };
}
