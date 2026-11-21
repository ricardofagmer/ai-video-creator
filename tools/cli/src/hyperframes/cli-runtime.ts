import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  HyperframesChromeMissingError,
  HyperframesSandboxUnavailableError,
  realPathOfExistingPrefix,
  resolveExecutable,
  workspaceRoot,
  type HyperframesBaseRuntime,
  type HyperframesRuntime,
} from '@studio/hyperframes';
import { hyperframesPaths } from '@studio/shared/hyperframes';
import { type CliSettings } from '../settings/cli-settings.js';
import { HyperframesStepRefusedError } from './hyperframes.errors.js';

/*
 * The runtime of a HyperFrames process started by the CLI (SPEC 0008 sections 4.4, 4.5 and 17.5).
 * Every path comes from `hyperframesPaths`, the settings, the pinned bin and the sandbox profile;
 * PATH is the CLI's child PATH (ffmpeg). Nothing else of the caller's environment is used.
 */

/** Used only if the child environment somehow lacks PATH; same order as the CLI's own fallback. */
const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
const OWNER_HYPERFRAMES_FOLDER = '.hyperframes';
/** `CHROME_DIR` is the whole Chrome cache root `<cache>/chrome`, where `chrome install` unpacks (B13). */
const CHROME_CACHE_FOLDER = 'chrome';
/** The CLI has no stage settings: ffmpeg and ffprobe are found by name on its child PATH (B12). */
const FFMPEG_NAME = 'ffmpeg';
const FFPROBE_NAME = 'ffprobe';

/** Who the CLI records as the writer of the gate files. */
export const HYPERFRAMES_CLI_ACTOR = 'cli';

export function baseRuntime(settings: CliSettings, options: { binPath: string; tmpDir: string }): HyperframesBaseRuntime {
  const paths = hyperframesPaths(settings.dataHome.root);
  return {
    // The CLI's own node binary, by absolute path: never resolved through PATH.
    nodePath: process.execPath,
    binPath: options.binPath,
    configDir: paths.configDir,
    cacheDir: paths.cacheDir,
    homeDir: paths.homeDir,
    tmpDir: options.tmpDir,
    path: settings.childEnvironment['PATH'] ?? FALLBACK_PATH,
  };
}

export interface RenderRuntimeOptions {
  binPath: string;
  tmpDir: string;
  /** `chrome.json.executablePath`, already checked by `verifyChromeBinary` (section 17.6). */
  browserPath: string;
  sandboxProfilePath: string;
}

function errorCodeOf(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/**
 * The real path of `path`. An absent component is the caller's refusal; any other failure means
 * the isolation cannot be configured (`sandbox-unavailable`, section 17.5).
 */
async function realPathOr(path: string, whenMissing: () => Error): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    const code = errorCodeOf(error);
    throw code === 'ENOENT' || code === 'ENOTDIR' ? whenMissing() : new HyperframesSandboxUnavailableError();
  }
}

function isStrictlyInside(folder: string, candidate: string): boolean {
  return candidate.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
}

const runtimeNotPrepared = (): Error => HyperframesStepRefusedError.forState('runtime-not-prepared');
const chromeChanged = (): Error => new HyperframesChromeMissingError('changed');
const sandboxUnavailable = (): Error => new HyperframesSandboxUnavailableError();

/**
 * The render runtime of section 17.5, every path a real path resolved before any start (K16, U14).
 * Refusals, zero starts: a missing `config/`, `cache/` or `home/` is `runtime-not-prepared`; a
 * missing Chrome folder or a real browser path outside it is `chrome-missing`; anything else
 * (ffmpeg or ffprobe not found, an unresolvable home or root) is `sandbox-unavailable`. The ports
 * come from `CliSettings.ports`, already checked to be 1024 to 65535.
 */
export async function resolveRenderRuntime(settings: CliSettings, options: RenderRuntimeOptions): Promise<HyperframesRuntime> {
  const base = baseRuntime(settings, options);
  const paths = hyperframesPaths(settings.dataHome.root);
  const configDir = await realPathOr(base.configDir, runtimeNotPrepared);
  const cacheDir = await realPathOr(base.cacheDir, runtimeNotPrepared);
  const homeDir = await realPathOr(base.homeDir, runtimeNotPrepared);
  const chromeDir = await realPathOr(join(cacheDir, CHROME_CACHE_FOLDER), chromeChanged);
  const browserPath = await realPathOr(options.browserPath, chromeChanged);
  if (!isStrictlyInside(chromeDir, browserPath)) throw chromeChanged();
  return {
    nodePath: await realPathOr(base.nodePath, sandboxUnavailable),
    binPath: base.binPath,
    configDir,
    cacheDir,
    homeDir,
    tmpDir: await realPathOr(base.tmpDir, sandboxUnavailable),
    path: base.path,
    browserPath,
    sandboxProfilePath: options.sandboxProfilePath,
    // Named only as the folder the sandbox denies; the CLI never reads, lists or copies it (AC 84).
    ownerConfigDir: await realPathOfExistingPrefix(join(settings.homeDirectory, OWNER_HYPERFRAMES_FOLDER)),
    ownerHomeDir: await realPathOr(settings.homeDirectory, sandboxUnavailable),
    studioRoot: await realPathOr(workspaceRoot(), sandboxUnavailable),
    dataHomeRoot: await realPathOr(settings.dataHome.root, sandboxUnavailable),
    hyperframesRoot: await realPathOr(paths.root, sandboxUnavailable),
    chromeDir,
    ffmpegBin: await resolveExecutable(FFMPEG_NAME, base.path),
    ffprobeBin: await resolveExecutable(FFPROBE_NAME, base.path),
    apiPort: settings.ports.api,
    webPort: settings.ports.web,
  };
}

/** A private scratch folder (`0700` from mkdtemp) removed after the work, whatever its outcome. */
export async function withScratchFolder<T>(prefix: string, work: (folder: string) => Promise<T>): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await work(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
