import { realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  engineState,
  hyperframesPaths,
  type HyperframesEngineFiles,
  type HyperframesPaths,
  type HyperframesRefusalReason,
} from '@studio/shared/hyperframes';
import { readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';
import { type RecordedChromeBinary } from './chrome-binary';
import { HyperframesChromeMissingError, HyperframesPinMismatchError, HyperframesSandboxUnavailableError } from './errors';
import { realPathOfExistingPrefix } from './executable-paths';
import { isInsideFolder } from './inside-folder';
import { realRenderRuntimeSystem, type RenderRuntimeSystem } from './render-runtime-system';
import { type HyperframesRuntime } from './runtime';

/*
 * The render runtime gate (docs/specs/2026-11-25-render-runtime-gate-design.md): the one place
 * that decides whether a HyperFrames render may start and builds the runtime it starts with
 * (SPEC 0008 sections 4.5, 5.2 check 1, 17.5, 17.6, 18.3 and 18.5). The watcher's composition stage
 * and the CLI's trace both ask here, so a passing trace proves the runtime a later render uses
 * (ADR 0008 decision 4). Nothing here starts a process or writes a file.
 */

const OWNER_HYPERFRAMES_FOLDER = '.hyperframes';
/** The CLI keeps Chrome under `<cacheDir>/chrome` (SPEC 0008 section 17.4, `CHROME_DIR`). */
const CHROME_CACHE_FOLDER = 'chrome';
const MIN_STUDIO_PORT = 1024;
const MAX_STUDIO_PORT = 65535;

export interface RenderRuntimeRequest {
  /**
   * A `trace` is the run that produces the engine's gate state, so it skips only the checks that
   * read that state (`engine-disabled`, `trace-missing`, `trace-stale`); every other check runs.
   */
  purpose: 'render' | 'trace';
  dataHomeRoot: string;
  /** The owner's home (`OWNER_HOME`), before resolution. */
  ownerHome: string;
  /** The child PATH, used to find `ffmpeg` and `ffprobe` given by name. */
  searchPath: string;
  /** A bare name looked up on `searchPath`, or an absolute path taken as is. */
  ffmpeg: string;
  ffprobe: string;
  studioPorts: { api: number; web: number };
  /** `STUDIO_ROOT` before resolution. */
  studioRoot: string;
}

/** The runtime without the three fields only the starting process knows. */
export type CheckedRenderRuntime = Omit<HyperframesRuntime, 'nodePath' | 'tmpDir' | 'path'>;

export type RenderRuntimeAnswer<T> = { status: 'ready'; runtime: T } | { status: 'refused'; reason: HyperframesRefusalReason };

type Checked<T> = { status: 'ok'; value: T } | { status: 'refused'; reason: HyperframesRefusalReason };

type RealFolder = { status: 'present'; realPath: string } | { status: 'missing' };

function refuse(reason: HyperframesRefusalReason): { status: 'refused'; reason: HyperframesRefusalReason } {
  return { status: 'refused', reason };
}

function errorCodeOf(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

function isStudioPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_STUDIO_PORT && port <= MAX_STUDIO_PORT;
}

/** The real path of a folder, or `missing` when it or a parent is absent or not a folder. */
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

/**
 * Section 17.5: a sandbox parameter that cannot be resolved means the isolation cannot be
 * configured, so the answer is `sandbox-unavailable` and nothing starts (K16).
 */
async function resolvedOrUnavailable<T>(work: () => Promise<T>): Promise<Checked<T>> {
  try {
    return { status: 'ok', value: await work() };
  } catch (error) {
    if (!(error instanceof HyperframesSandboxUnavailableError) && errorCodeOf(error) === null) throw error;
    return refuse('sandbox-unavailable');
  }
}

/** The first refusal the gate files give for this purpose, in the order of section 4.5. */
function gateFilesRefusal(
  files: HyperframesEngineFiles,
  purpose: RenderRuntimeRequest['purpose'],
  profileSha256: string,
): HyperframesRefusalReason | null {
  if (purpose === 'render') {
    const state = engineState(files, { profileSha256 });
    return state === 'ready' ? null : state;
  }
  if (files.chrome.status !== 'present' || !files.chromeBinaryPresent) return 'chrome-missing';
  if (!files.configSeeded) return 'runtime-not-prepared';
  return null;
}

/** Section 17.6 (L1): the recorded binary is hashed again before every render; any change refuses. */
async function chromeUnchanged(system: RenderRuntimeSystem, recorded: RecordedChromeBinary, cacheDir: string): Promise<boolean> {
  try {
    await system.verifyChromeBinary(recorded, { cacheDir });
    return true;
  } catch (error) {
    if (!(error instanceof HyperframesChromeMissingError)) throw error;
    return false;
  }
}

type PreparedFolders = Pick<CheckedRenderRuntime, 'configDir' | 'cacheDir' | 'homeDir'>;

/** `config/`, `cache/` and `home/` as real paths; a missing one is `runtime-not-prepared`. */
async function preparedFolders(paths: HyperframesPaths): Promise<Checked<PreparedFolders>> {
  const found = await resolvedOrUnavailable(() => Promise.all([realFolder(paths.configDir), realFolder(paths.cacheDir), realFolder(paths.homeDir)]));
  if (found.status === 'refused') return found;
  const [configDir, cacheDir, homeDir] = found.value;
  if (configDir.status === 'missing' || cacheDir.status === 'missing' || homeDir.status === 'missing') return refuse('runtime-not-prepared');
  return { status: 'ok', value: { configDir: configDir.realPath, cacheDir: cacheDir.realPath, homeDir: homeDir.realPath } };
}

type ChromePaths = Pick<CheckedRenderRuntime, 'chromeDir' | 'browserPath'>;

/** `CHROME_DIR` and `CHROME_BIN` as real paths; a binary outside `<cacheDir>/chrome` is `chrome-missing`. */
async function chromePaths(realCacheDir: string, executablePath: string): Promise<Checked<ChromePaths>> {
  const resolved = await resolvedOrUnavailable(() => Promise.all([realFolder(join(realCacheDir, CHROME_CACHE_FOLDER)), realpath(executablePath)]));
  if (resolved.status === 'refused') return refuse('chrome-missing');
  const [chromeDir, browserPath] = resolved.value;
  if (chromeDir.status === 'missing' || !isInsideFolder(chromeDir.realPath, browserPath)) return refuse('chrome-missing');
  return { status: 'ok', value: { chromeDir: chromeDir.realPath, browserPath } };
}

type SandboxPaths = Pick<
  CheckedRenderRuntime,
  'ownerHomeDir' | 'ownerConfigDir' | 'studioRoot' | 'dataHomeRoot' | 'hyperframesRoot' | 'ffmpegBin' | 'ffprobeBin'
>;

/** The owner, studio and data home paths and the two media programs, each a real path (section 17.5). */
async function sandboxPaths(system: RenderRuntimeSystem, request: RenderRuntimeRequest, paths: HyperframesPaths): Promise<Checked<SandboxPaths>> {
  return resolvedOrUnavailable(async (): Promise<SandboxPaths> => {
    const [ownerHomeDir, studioRoot, dataHomeRoot, hyperframesRoot, ffmpegBin, ffprobeBin] = await Promise.all([
      realpath(request.ownerHome),
      realpath(request.studioRoot),
      realpath(request.dataHomeRoot),
      realpath(paths.root),
      system.resolveExecutable(request.ffmpeg, request.searchPath),
      system.resolveExecutable(request.ffprobe, request.searchPath),
    ]);
    // Named only as the folder the sandbox denies; it is never read, listed or copied.
    const ownerConfigDir = await realPathOfExistingPrefix(join(ownerHomeDir, OWNER_HYPERFRAMES_FOLDER));
    return { ownerHomeDir, ownerConfigDir, studioRoot, dataHomeRoot, hyperframesRoot, ffmpegBin, ffprobeBin };
  });
}

/**
 * The media programs run outside the sandbox after the render, so neither may sit in a folder the
 * sandbox writes: the real `config/`, `cache/` and `home/` (checked on their own, since a symlink
 * may place them outside the data home) or anywhere under the data home (section 18.5).
 */
function mediaProgramsOutsideWritableFolders(sandbox: SandboxPaths, folders: PreparedFolders): boolean {
  const writableFolders = [sandbox.dataHomeRoot, folders.configDir, folders.cacheDir, folders.homeDir];
  return [sandbox.ffmpegBin, sandbox.ffprobeBin].every((program) => writableFolders.every((folder) => !isInsideFolder(folder, program)));
}

/**
 * Whether a render may start, answered as its runtime or the first refusal reason. In order: the
 * gate files; the `config/`, `cache/` and `home/` folders (section 18.3, before Chrome so a
 * missing `cache/` answers `runtime-not-prepared`); the Chrome binary (section 17.6); the pin and
 * `sandbox-exec`; every sandbox parameter of section 17.5 as a real path, with the media programs
 * outside every folder the sandbox writes (section 18.5); and the studio ports. Throws only for a
 * failure that is none of these.
 */
export async function checkRenderRuntime(
  request: RenderRuntimeRequest,
  system: RenderRuntimeSystem = realRenderRuntimeSystem,
): Promise<RenderRuntimeAnswer<CheckedRenderRuntime>> {
  const files = await readHyperframesEngineFiles(request.dataHomeRoot);
  let profile: { path: string; sha256: string };
  try {
    profile = system.sandboxProfile();
  } catch (error) {
    if (errorCodeOf(error) === null) throw error;
    // Section 4.5 first match (AC 70): the gate files answer before the profile matters, so a
    // disabled engine still reads `engine-disabled`. The profile hash only decides `trace-stale`,
    // and an unreadable profile (it ships inside this package) means no sandbox to run in.
    const withoutProfile = gateFilesRefusal(files, request.purpose, '');
    return refuse(withoutProfile === null || withoutProfile === 'trace-stale' ? 'sandbox-unavailable' : withoutProfile);
  }
  const gateFiles = gateFilesRefusal(files, request.purpose, profile.sha256);
  if (gateFiles !== null) return refuse(gateFiles);
  if (files.chrome.status !== 'present') return refuse('chrome-missing');
  const paths = hyperframesPaths(request.dataHomeRoot);
  const folders = await preparedFolders(paths);
  if (folders.status === 'refused') return folders;
  if (!(await chromeUnchanged(system, files.chrome.value, paths.cacheDir))) return refuse('chrome-missing');
  let binPath: string;
  try {
    binPath = system.pinnedBinPath();
  } catch (error) {
    if (!(error instanceof HyperframesPinMismatchError)) throw error;
    return refuse('pin-mismatch');
  }
  if (!system.sandboxExecExists()) return refuse('sandbox-unavailable');
  const chrome = await chromePaths(folders.value.cacheDir, files.chrome.value.executablePath);
  if (chrome.status === 'refused') return chrome;
  const sandbox = await sandboxPaths(system, request, paths);
  if (sandbox.status === 'refused') return sandbox;
  if (!mediaProgramsOutsideWritableFolders(sandbox.value, folders.value)) return refuse('sandbox-unavailable');
  const { api: apiPort, web: webPort } = request.studioPorts;
  if (!isStudioPort(apiPort) || !isStudioPort(webPort)) return refuse('sandbox-unavailable');
  return {
    status: 'ready',
    runtime: { binPath, sandboxProfilePath: profile.path, ...folders.value, ...chrome.value, ...sandbox.value, apiPort, webPort },
  };
}

/** What only the process that starts HyperFrames knows. */
export interface StartingProcess {
  /** Its own node binary, by absolute path: never resolved through PATH. */
  nodePath: string;
  /** The scratch folder of this start. */
  tmpDir: string;
  /** The child PATH. An environment value, never a `-D` sandbox parameter (AC 88). */
  path: string;
}

/**
 * The checked runtime completed in the process that starts HyperFrames. `nodePath` and `tmpDir`
 * reach the sandbox profile, so both become real paths here (section 17.5, K16, U14); one that
 * cannot be resolved answers `sandbox-unavailable`.
 */
export async function completeRenderRuntime(checked: CheckedRenderRuntime, starting: StartingProcess): Promise<RenderRuntimeAnswer<HyperframesRuntime>> {
  const resolved = await resolvedOrUnavailable(() => Promise.all([realpath(starting.nodePath), realpath(starting.tmpDir)]));
  if (resolved.status === 'refused') return resolved;
  const [nodePath, tmpDir] = resolved.value;
  return { status: 'ready', runtime: { ...checked, nodePath, tmpDir, path: starting.path } };
}
