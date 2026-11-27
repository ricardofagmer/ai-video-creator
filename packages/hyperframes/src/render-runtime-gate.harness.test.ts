import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  HYPERFRAMES_CHROME_VERSION,
  HYPERFRAMES_FORMAT_VERSION,
  HYPERFRAMES_PIN,
  hyperframesPaths,
  type HyperframesChromeFile,
  type HyperframesEngineFile,
  type HyperframesPaths,
  type HyperframesTraceFile,
} from '@studio/shared/hyperframes';
import { ensureHyperframesFolders, writeChromeFile, writeEngineFile, writeTraceFile } from '@studio/shared/hyperframes/files';
import { verifyChromeBinary } from './chrome-binary';
import { HyperframesPinMismatchError } from './errors';
import { checkRenderRuntime, type CheckedRenderRuntime, type RenderRuntimeRequest } from './render-runtime-gate';
import { fakeRenderRuntimeSystem, type RenderRuntimeSystem } from './render-runtime-system';

/*
 * A temporary data home for the render runtime gate tests (docs/specs/2026-11-25-render-runtime-gate-design.md
 * decision 5). Every gate file, folder, Chrome binary and media program is a real file under one
 * `mkdtemp` folder; only the pin, the sandbox profile and `sandbox-exec` come from
 * `fakeRenderRuntimeSystem`. The Chrome binary is verified by the real `verifyChromeBinary`, so a
 * test changes it by changing its bytes. Nothing here starts a process.
 */

/** What `fakeRenderRuntimeSystem` answers for the pin and the profile. */
export const FAKE_BIN_PATH = '/fake/node_modules/hyperframes/bin/hyperframes.mjs';
export const FAKE_PROFILE_PATH = '/fake/sandbox/render.sb';
export const FAKE_PROFILE_SHA256 = '0'.repeat(64);

export const API_PORT = 4310;
export const WEB_PORT = 4320;

const CHROME_BYTES = 'fake chrome-headless-shell binary\n';
const AT = '2026-11-20T10:00:00.000Z';

export interface TestDataHome {
  /** Real path of the `mkdtemp` folder that holds everything below. */
  root: string;
  /** The data home as callers pass it: a link to the real folder, so the gate must resolve it. */
  dataHomeRoot: string;
  /** Real path of the data home. */
  realDataHomeRoot: string;
  /** `hyperframesPaths` of `dataHomeRoot` (the unresolved link). */
  paths: HyperframesPaths;
  /** Owner home and studio root as callers pass them: links to real folders. */
  ownerHome: string;
  studioRoot: string;
  realOwnerHome: string;
  realStudioRoot: string;
  /** A folder outside the data home that holds `ffmpeg` and `ffprobe`, used as the child PATH. */
  binDir: string;
  /** `chrome.json.executablePath`, under the unresolved data home. */
  browserPath: string;
  chrome: HyperframesChromeFile;
}

function sha256Of(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function engineFile(state: HyperframesEngineFile['state']): HyperframesEngineFile {
  return { format: HYPERFRAMES_FORMAT_VERSION, state, updatedAt: AT, updatedBy: 'owner' };
}

export function traceFile(overrides: Partial<HyperframesTraceFile> = {}): HyperframesTraceFile {
  return {
    format: HYPERFRAMES_FORMAT_VERSION,
    result: 'pass',
    at: AT,
    by: 'owner',
    pin: HYPERFRAMES_PIN,
    chromeSha256: sha256Of(CHROME_BYTES),
    profileSha256: FAKE_PROFILE_SHA256,
    templateContentHash: 'e'.repeat(64),
    controlDenied: true,
    renderExitCode: 0,
    outputOk: true,
    deniedNetwork: 0,
    ownerConfigDirDenied: 0,
    findings: [],
    ...overrides,
  };
}

/** An executable regular file; its content is never run. */
export async function writeProgram(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '#!/bin/sh\nexit 0\n');
  await chmod(path, 0o755);
}

/** A Chrome binary with the fixed bytes at `path`, and the `chrome.json` that records it. */
export async function placeChrome(home: TestDataHome, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, CHROME_BYTES);
  await writeChromeFile(home.dataHomeRoot, { ...home.chrome, executablePath: path });
}

/**
 * A data home on which `checkRenderRuntime` answers `ready` for both purposes: the engine enabled,
 * a passing trace matching the fake profile and the Chrome bytes, `config/config.json` seeded,
 * Chrome at `cache/chrome/headless-shell`, and both media programs in `bin/` outside the data home.
 */
export async function createReadyDataHome(): Promise<TestDataHome> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hyperframes-render-gate-')));
  const realDataHomeRoot = join(root, 'data-home');
  const realOwnerHome = join(root, 'owner-home');
  const realStudioRoot = join(root, 'studio');
  const binDir = join(root, 'bin');
  await Promise.all([mkdir(realDataHomeRoot), mkdir(realOwnerHome), mkdir(realStudioRoot), mkdir(binDir)]);
  const links = join(root, 'links');
  await mkdir(links);
  const dataHomeRoot = join(links, 'data-home');
  const ownerHome = join(links, 'owner-home');
  const studioRoot = join(links, 'studio');
  await Promise.all([symlink(realDataHomeRoot, dataHomeRoot), symlink(realOwnerHome, ownerHome), symlink(realStudioRoot, studioRoot)]);
  const paths = hyperframesPaths(dataHomeRoot);
  const browserPath = join(paths.cacheDir, 'chrome', 'headless-shell');
  const chrome: HyperframesChromeFile = {
    format: HYPERFRAMES_FORMAT_VERSION,
    version: HYPERFRAMES_CHROME_VERSION,
    executablePath: browserPath,
    sha256: sha256Of(CHROME_BYTES),
    sizeBytes: Buffer.byteLength(CHROME_BYTES),
    installedAt: AT,
    installedBy: 'owner',
  };
  const home: TestDataHome = {
    root,
    dataHomeRoot,
    realDataHomeRoot,
    paths,
    ownerHome,
    studioRoot,
    realOwnerHome,
    realStudioRoot,
    binDir,
    browserPath,
    chrome,
  };
  await ensureHyperframesFolders(dataHomeRoot);
  await writeFile(paths.configFile, '{}\n');
  await placeChrome(home, browserPath);
  await writeEngineFile(dataHomeRoot, engineFile('enabled'));
  await writeTraceFile(dataHomeRoot, traceFile());
  await Promise.all([writeProgram(join(binDir, 'ffmpeg')), writeProgram(join(binDir, 'ffprobe'))]);
  return home;
}

export async function removeDataHome(home: TestDataHome | undefined): Promise<void> {
  if (home !== undefined) await rm(home.root, { recursive: true, force: true });
}

/** The request a caller would send for this data home: media programs by name on `binDir`. */
export function requestFor(home: TestDataHome, purpose: Purpose, overrides: Partial<RenderRuntimeRequest> = {}): RenderRuntimeRequest {
  return {
    purpose,
    dataHomeRoot: home.dataHomeRoot,
    ownerHome: home.ownerHome,
    searchPath: home.binDir,
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe',
    studioPorts: { api: API_PORT, web: WEB_PORT },
    studioRoot: home.studioRoot,
    ...overrides,
  };
}

/** The fake system with the real Chrome verification, plus the test's overrides. */
export function testSystem(overrides: Partial<RenderRuntimeSystem> = {}): RenderRuntimeSystem {
  return fakeRenderRuntimeSystem({ verifyChromeBinary, ...overrides });
}

/** An error as `fs` throws it, with a `code`. */
export function fsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

export type Purpose = RenderRuntimeRequest['purpose'];

export interface Arranged {
  system?: Partial<RenderRuntimeSystem>;
  request?: Partial<RenderRuntimeRequest>;
}

export const BOTH: readonly Purpose[] = ['render', 'trace'];

/** The trace purpose's own starting point: nothing in the gate-file state lets a render start. */
export async function withoutGateState(home: TestDataHome): Promise<void> {
  await writeEngineFile(home.dataHomeRoot, engineFile('disabled'));
  await rm(home.paths.traceFile);
}

export async function answerOf(home: TestDataHome, purpose: Purpose, arranged: Arranged | void): ReturnType<typeof checkRenderRuntime> {
  return checkRenderRuntime(requestFor(home, purpose, arranged?.request), testSystem(arranged?.system));
}

export function expectedRuntime(home: TestDataHome, overrides: Partial<CheckedRenderRuntime> = {}): CheckedRenderRuntime {
  const realRoot = join(home.realDataHomeRoot, 'hyperframes');
  return {
    binPath: FAKE_BIN_PATH,
    sandboxProfilePath: FAKE_PROFILE_PATH,
    configDir: join(realRoot, 'config'),
    cacheDir: join(realRoot, 'cache'),
    homeDir: join(realRoot, 'home'),
    chromeDir: join(realRoot, 'cache', 'chrome'),
    browserPath: join(realRoot, 'cache', 'chrome', 'headless-shell'),
    ownerHomeDir: home.realOwnerHome,
    ownerConfigDir: join(home.realOwnerHome, '.hyperframes'),
    studioRoot: home.realStudioRoot,
    dataHomeRoot: home.realDataHomeRoot,
    hyperframesRoot: realRoot,
    ffmpegBin: join(home.binDir, 'ffmpeg'),
    ffprobeBin: join(home.binDir, 'ffprobe'),
    apiPort: API_PORT,
    webPort: WEB_PORT,
    ...overrides,
  };
}

/** Moves `folder` out of the data home and leaves a link in its place; answers the real target. */
export async function linkOutside(home: TestDataHome, folder: string, name: string): Promise<string> {
  const target = join(home.root, name);
  await rename(folder, target);
  await symlink(target, folder);
  return target;
}

export const pinMismatch = (): string => {
  throw new HyperframesPinMismatchError('other-version');
};

/** Same size, other bytes: the recorded sha-256 no longer matches (section 17.6). */
export async function changeChromeBytes(home: TestDataHome): Promise<void> {
  await writeFile(home.browserPath, 'FAKE CHROME-HEADLESS-SHELL BINARY\n');
}

/** A verified binary inside `cache/` but outside `cache/chrome/`. */
export async function chromeOutsideChromeFolder(home: TestDataHome): Promise<void> {
  await placeChrome(home, join(home.paths.cacheDir, 'elsewhere', 'headless-shell'));
}

/** In the check order of the Shape section; each arrangement leaves every earlier check passing. */
