import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import {
  HyperframesChromeMissingError,
  HyperframesPinMismatchError,
  HyperframesSandboxUnavailableError,
  type RecordedChromeBinary,
} from '@studio/hyperframes';
import { type ScriptOutput } from '@studio/shared/agents';
import { type TemplateDetails } from '@studio/shared/catalog';
import {
  engineState,
  hyperframesPaths,
  hyperframesTemplateIssues,
  parseFlatInputSchema,
  resolveTemplateVariables,
  type HyperframesPaths,
  type HyperframesRefusalReason,
  type HyperframesVariableValue,
  type StudioTemplateVariable,
} from '@studio/shared/hyperframes';
import { type HyperframesRenderRequest } from '../process/tool-runner.protocol';
import { type StageSettings } from '../shared/stage-settings';
import { type HyperframesStagePorts } from './hyperframes-stage.ports';

/*
 * The pre-start checks of SPEC 0008 section 5.2 that need no run output (1 to 4) and the variable
 * resolution of check 6 (section 5.3). Each answers the first refusal reason or the facts the
 * next step needs; nothing here starts a process or writes a file.
 */

const OWNER_HYPERFRAMES_FOLDER = '.hyperframes';
/** The CLI keeps Chrome under `<cacheDir>/chrome` (SPEC 0008 section 17.4, `CHROME_DIR`). */
const CHROME_CACHE_FOLDER = 'chrome';
const MIN_STUDIO_PORT = 1024;
const MAX_STUDIO_PORT = 65535;

export type HyperframesRuntimeRequest = HyperframesRenderRequest['runtime'];

/** What check 1 reads from the stage settings: the owner's home, the child PATH, ffmpeg, ffprobe, the studio ports. */
export type EngineRuntimeSettings = Pick<StageSettings, 'home' | 'path' | 'ffmpegPath' | 'ffprobePath' | 'studioPorts'>;

export type Checked<T> = { status: 'ok'; value: T } | { status: 'refused'; reason: HyperframesRefusalReason };

function refuse<T>(reason: HyperframesRefusalReason): Checked<T> {
  return { status: 'refused', reason };
}

function isFileReadError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

function isInsideFolder(folder: string, candidate: string): boolean {
  return candidate.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
}

function isStudioPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_STUDIO_PORT && port <= MAX_STUDIO_PORT;
}

/**
 * Section 17.5: a sandbox parameter that cannot be resolved means the isolation cannot be
 * configured, so the answer is `sandbox-unavailable` and nothing starts (K16).
 */
async function resolvedOrUnavailable<T>(work: () => Promise<T>): Promise<Checked<T>> {
  try {
    return { status: 'ok', value: await work() };
  } catch (error) {
    if (!(error instanceof HyperframesSandboxUnavailableError) && !isFileReadError(error)) throw error;
    return refuse('sandbox-unavailable');
  }
}

/** Section 17.6 (L1): the recorded binary is hashed again before every render; any change refuses. */
async function chromeUnchanged(ports: HyperframesStagePorts, recorded: RecordedChromeBinary, cacheDir: string): Promise<boolean> {
  try {
    await ports.verifyChromeBinary(recorded, { cacheDir });
    return true;
  } catch (error) {
    if (!(error instanceof HyperframesChromeMissingError)) throw error;
    return false;
  }
}

type PreparedFolders = Pick<HyperframesRuntimeRequest, 'configDir' | 'cacheDir' | 'homeDir'>;

/** `config/`, `cache/` and `home/` as real paths; a missing one is `runtime-not-prepared`. */
async function preparedFolders(ports: HyperframesStagePorts, paths: HyperframesPaths): Promise<Checked<PreparedFolders>> {
  const found = await resolvedOrUnavailable(() =>
    Promise.all([ports.realFolder(paths.configDir), ports.realFolder(paths.cacheDir), ports.realFolder(paths.homeDir)]),
  );
  if (found.status === 'refused') return found;
  const [configDir, cacheDir, homeDir] = found.value;
  if (configDir.status === 'missing' || cacheDir.status === 'missing' || homeDir.status === 'missing') return refuse('runtime-not-prepared');
  return { status: 'ok', value: { configDir: configDir.realPath, cacheDir: cacheDir.realPath, homeDir: homeDir.realPath } };
}

type ChromePaths = Pick<HyperframesRuntimeRequest, 'chromeDir' | 'browserPath'>;

/** `CHROME_DIR` and `CHROME_BIN` as real paths; a binary outside `<cacheDir>/chrome` is `chrome-missing`. */
async function chromePaths(ports: HyperframesStagePorts, realCacheDir: string, executablePath: string): Promise<Checked<ChromePaths>> {
  const resolved = await resolvedOrUnavailable(() =>
    Promise.all([ports.realFolder(join(realCacheDir, CHROME_CACHE_FOLDER)), ports.realPath(executablePath)]),
  );
  if (resolved.status === 'refused') return refuse('chrome-missing');
  const [chromeDir, browserPath] = resolved.value;
  if (chromeDir.status === 'missing' || !isInsideFolder(chromeDir.realPath, browserPath)) return refuse('chrome-missing');
  return { status: 'ok', value: { chromeDir: chromeDir.realPath, browserPath } };
}

type SandboxPaths = Pick<
  HyperframesRuntimeRequest,
  'ownerHomeDir' | 'ownerConfigDir' | 'studioRoot' | 'dataHomeRoot' | 'hyperframesRoot' | 'ffmpegBin' | 'ffprobeBin'
>;

/** The owner, studio and data home paths and the two media programs, each a real path (section 17.5). */
async function sandboxPaths(ports: HyperframesStagePorts, settings: EngineRuntimeSettings, paths: HyperframesPaths): Promise<Checked<SandboxPaths>> {
  return resolvedOrUnavailable(async (): Promise<SandboxPaths> => {
    const [ownerHomeDir, studioRoot, dataHomeRoot, hyperframesRoot, ffmpegBin, ffprobeBin] = await Promise.all([
      ports.realPath(settings.home ?? homedir()),
      ports.realPath(ports.studioRoot()),
      ports.realPath(ports.dataHomeRoot),
      ports.realPath(paths.root),
      ports.resolveExecutable(settings.ffmpegPath, settings.path),
      ports.resolveExecutable(settings.ffprobePath, settings.path),
    ]);
    // Named only as the folder the sandbox denies; the watcher never reads, lists or copies it.
    const ownerConfigDir = await ports.realPathOfExistingPrefix(join(ownerHomeDir, OWNER_HYPERFRAMES_FOLDER));
    return { ownerHomeDir, ownerConfigDir, studioRoot, dataHomeRoot, hyperframesRoot, ffmpegBin, ffprobeBin };
  });
}

/**
 * Check 1: the gate files, the Chrome binary (section 17.6), the pin and `sandbox-exec`, then every
 * sandbox parameter of section 17.5 resolved to a real path. The answer is the render's runtime.
 */
export async function engineRuntime(ports: HyperframesStagePorts, settings: EngineRuntimeSettings): Promise<Checked<HyperframesRuntimeRequest>> {
  const files = await ports.readEngineFiles(ports.dataHomeRoot);
  let profile: { path: string; sha256: string };
  try {
    profile = ports.sandboxProfile();
  } catch (error) {
    if (!isFileReadError(error)) throw error;
    // Section 4.5 first match (AC 70): the gate files answer before the profile matters, so a
    // disabled engine still reads `engine-disabled`. The profile hash only decides `trace-stale`,
    // and an unreadable profile (it ships inside `@studio/hyperframes`) means no sandbox to run in.
    const withoutProfile = engineState(files, { profileSha256: '' });
    return refuse(withoutProfile === 'ready' || withoutProfile === 'trace-stale' ? 'sandbox-unavailable' : withoutProfile);
  }
  const state = engineState(files, { profileSha256: profile.sha256 });
  if (state !== 'ready') return refuse(state);
  if (files.chrome.status !== 'present') return refuse('chrome-missing');
  const paths = hyperframesPaths(ports.dataHomeRoot);
  // Before the Chrome check, so a missing cache/ answers runtime-not-prepared, not chrome-missing (SPEC 0008 section 18.3).
  const folders = await preparedFolders(ports, paths);
  if (folders.status === 'refused') return folders;
  if (!(await chromeUnchanged(ports, files.chrome.value, paths.cacheDir))) return refuse('chrome-missing');
  let binPath: string;
  try {
    binPath = ports.pinnedBinPath();
  } catch (error) {
    if (!(error instanceof HyperframesPinMismatchError)) throw error;
    return refuse('pin-mismatch');
  }
  if (!ports.sandboxExecExists()) return refuse('sandbox-unavailable');
  const chrome = await chromePaths(ports, folders.value.cacheDir, files.chrome.value.executablePath);
  if (chrome.status === 'refused') return chrome;
  const sandbox = await sandboxPaths(ports, settings, paths);
  if (sandbox.status === 'refused') return sandbox;
  const { api: apiPort, web: webPort } = settings.studioPorts;
  if (!isStudioPort(apiPort) || !isStudioPort(webPort)) return refuse('sandbox-unavailable');
  return {
    status: 'ok',
    value: { binPath, sandboxProfilePath: profile.path, ...folders.value, ...chrome.value, ...sandbox.value, apiPort, webPort },
  };
}

/** Checks 2 to 4: flat template, the recipe's canvas and fps, the narration inside the range. */
export function templateFitsRun(
  details: TemplateDetails,
  run: { canvas: { width: number; height: number }; fps: number; narrationS: number },
): HyperframesRefusalReason | null {
  if (hyperframesTemplateIssues(details).length > 0) return 'template-not-flat';
  if (details.canvas.width !== run.canvas.width || details.canvas.height !== run.canvas.height || details.fps !== run.fps) {
    return 'canvas-mismatch';
  }
  if (run.narrationS < details.duration.minSec || run.narrationS > details.duration.maxSec) return 'duration-out-of-range';
  return null;
}

export interface VariableInputs {
  details: TemplateDetails;
  recipeValues: unknown;
  script: ScriptOutput;
  disclosure: string;
  narrationS: number;
  accent: string | null;
}

/** Check 6 (section 5.3): recipe values first, then the studio vocabulary, then the template default. */
export function templateVariables(inputs: VariableInputs): Checked<Readonly<Record<string, HyperframesVariableValue>>> {
  const parsed = parseFlatInputSchema(inputs.details.inputSchema);
  if (parsed.status !== 'valid') return refuse('template-not-flat');
  const vocabulary: Partial<Record<StudioTemplateVariable, HyperframesVariableValue>> = {
    title: inputs.script.title,
    hook: inputs.script.hook,
    disclosure: inputs.disclosure,
    durationS: inputs.narrationS,
  };
  if (inputs.accent !== null) vocabulary.accent = inputs.accent;
  const resolution = resolveTemplateVariables({ schema: parsed.schema, recipeValues: inputs.recipeValues, vocabulary });
  return resolution.status === 'resolved' ? { status: 'ok', value: resolution.variables } : refuse(resolution.reason);
}
