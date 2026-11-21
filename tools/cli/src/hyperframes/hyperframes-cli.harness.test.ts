import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DataHome } from '@studio/core/paths';
import { FakeHyperframesProcessPort, sandboxProfile, type HyperframesProcessPort, type HyperframesProcessRequest } from '@studio/hyperframes';
import {
  HYPERFRAMES_CHROME_VERSION,
  HYPERFRAMES_FORMAT_VERSION,
  HYPERFRAMES_PIN,
  hyperframesPaths,
  type HyperframesEngineFile,
  type HyperframesPaths,
  type HyperframesTraceFile,
} from '@studio/shared/hyperframes';
import { ensureHyperframesFolders, writeChromeFile, writeEngineFile, writeTraceFile } from '@studio/shared/hyperframes/files';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { CapturingPrinter, ScriptedTerminal } from '../platforms/platform-cli.harness.test.js';
import {
  type HyperframesCliEvent,
  type HyperframesCommandPorts,
  type HyperframesEventPort,
  type HyperframesSystemPort,
  type PictureProbe,
  type PictureProbeRead,
  type SandboxDenial,
  type SandboxLogRead,
} from './hyperframes-ports.js';

/*
 * Test-only world for the `studio hyperframes` commands (SPEC 0008 K11, AC 82). Everything lives
 * under one OS temp folder: the data home, the studio root holding a copy-sized seed template, and
 * the owner's home folder. The process port is the in-memory fake of `@studio/hyperframes`; the
 * system port (sandbox, log, ffprobe) answers from fields. Nothing here starts a process, opens the
 * network, or reads the real data home, `~/.hyperframes` or `~/.cache/hyperframes`.
 */

export const NOW = new Date('2026-11-21T12:00:00.000Z');
export const CONTROL_TARGET = '192.0.2.1:9';
export const SEEDED_CHROME_SHA256 = 'c'.repeat(64);
/** Folder name the pinned build unpacks into under `cache/chrome/`. */
export const PINNED_BUILD_FOLDER = `mac_arm-${HYPERFRAMES_CHROME_VERSION}`;
export const SHELL_FILE_NAME = 'chrome-headless-shell';

const TRACE_TEMPLATE_RELATIVE = join('seeds', 'templates', 'hyperframes', 'title-card');

export interface HyperframesTestStudio {
  /** The temp root; every path the commands may use sits below it. */
  root: string;
  dataHomeRoot: string;
  studioRoot: string;
  homeDirectory: string;
  paths: HyperframesPaths;
  printer: CapturingPrinter;
  dependencies: CommandDependencies;
  remove(): Promise<void>;
}

/** An empty data home (no `hyperframes/` folder), a studio root with a small template, an empty home. */
export async function createHyperframesStudio(): Promise<HyperframesTestStudio> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-cli-hyperframes-')));
  const dataHomeRoot = join(root, 'data');
  const studioRoot = join(root, 'studio');
  const homeDirectory = join(root, 'home');
  await mkdir(dataHomeRoot, { recursive: true });
  await mkdir(homeDirectory, { recursive: true });
  const templateDir = join(studioRoot, TRACE_TEMPLATE_RELATIVE);
  await mkdir(templateDir, { recursive: true });
  await writeFile(join(templateDir, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body></body></html>\n');
  await writeFile(join(templateDir, 'style.css'), 'body { margin: 0; }\n');
  const printer = new CapturingPrinter();
  const dependencies: CommandDependencies = {
    settings: {
      dataHome: new DataHome(dataHomeRoot),
      ports: { web: 4310, api: 4311 },
      studioRoot,
      childEnvironment: { PATH: '/usr/bin:/bin' },
      keyVariablesSet: [],
      homeDirectory,
    },
    printer,
    signal: new AbortController().signal,
  };
  return {
    root,
    dataHomeRoot,
    studioRoot,
    homeDirectory,
    paths: hyperframesPaths(dataHomeRoot),
    printer,
    dependencies,
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

type RunHook = (request: HyperframesProcessRequest) => Promise<void>;

/** The fake process port, plus an optional hook that acts like the child (for `browser ensure`). */
export class ScriptedProcessPort implements HyperframesProcessPort {
  private readonly fake: FakeHyperframesProcessPort;

  constructor(
    exitCodes: readonly number[] = [],
    private readonly onRun: RunHook | null = null,
  ) {
    this.fake = new FakeHyperframesProcessPort(exitCodes);
  }

  get requests(): readonly HyperframesProcessRequest[] {
    return this.fake.requests;
  }

  async run(request: HyperframesProcessRequest): Promise<{ exitCode: number }> {
    if (this.onRun !== null) await this.onRun(request);
    return this.fake.run(request);
  }
}

export function goodProbe(): PictureProbe {
  return { codec: 'h264', pixelFormat: 'yuv420p', width: 1080, height: 1920, fps: 30, durationS: 30 };
}

export function controlDenial(): SandboxDenial {
  return { process: 'node', operation: 'network-outbound', target: CONTROL_TARGET };
}

/** Sandbox, log and ffprobe answered from fields; every call is recorded. */
export class FakeSystemPort implements HyperframesSystemPort {
  sandboxAvailable = true;
  logRead: SandboxLogRead = { status: 'read', denials: [controlDenial()] };
  probeRead: PictureProbeRead = { status: 'read', probe: goodProbe() };
  readonly logWindows: { start: Date; end: Date }[] = [];
  readonly probedFiles: string[] = [];

  // An arrow property: the trace hands this function to `renderPicture` unbound.
  readonly sandboxExecExists = (): boolean => this.sandboxAvailable;

  async readSandboxDenials(window: { start: Date; end: Date }): Promise<SandboxLogRead> {
    this.logWindows.push(window);
    return this.logRead;
  }

  async probePicture(file: string): Promise<PictureProbeRead> {
    this.probedFiles.push(file);
    return this.probeRead;
  }

  async pause(): Promise<void> {
    // The real port waits for the log to flush; nothing to wait for here.
  }
}

export class RecordingEventPort implements HyperframesEventPort {
  readonly events: HyperframesCliEvent[] = [];

  async record(event: HyperframesCliEvent): Promise<void> {
    this.events.push(event);
  }
}

export interface FakeHyperframesPorts {
  ports: HyperframesCommandPorts;
  terminal: ScriptedTerminal;
  processPort: ScriptedProcessPort;
  system: FakeSystemPort;
  events: RecordingEventPort;
  /** How many times a command asked for a process adapter. */
  processAdaptersOpened(): number;
}

export function createFakePorts(options: { interactive: boolean; answers?: string[]; processPort?: ScriptedProcessPort }): FakeHyperframesPorts {
  const terminal = new ScriptedTerminal(options.interactive, options.answers ?? []);
  const processPort = options.processPort ?? new ScriptedProcessPort();
  const system = new FakeSystemPort();
  const events = new RecordingEventPort();
  let opened = 0;
  const ports: HyperframesCommandPorts = {
    now: () => NOW,
    terminal,
    process: () => {
      opened += 1;
      return processPort;
    },
    system,
    events,
  };
  return { ports, terminal, processPort, system, events, processAdaptersOpened: () => opened };
}

/** A placeholder file standing in for the browser binary; it is only hashed or stat-ed, never run. */
export async function writePlaceholderShell(studio: HyperframesTestStudio, buildFolder: string, content = 'placeholder browser bytes'): Promise<string> {
  const shellPath = join(studio.paths.cacheDir, 'chrome', buildFolder, 'chrome-headless-shell-mac-arm64', SHELL_FILE_NAME);
  await mkdir(dirname(shellPath), { recursive: true });
  await writeFile(shellPath, content);
  return shellPath;
}

/** `chrome.json` plus the binary it names, as `chrome install` leaves them. */
export async function seedChrome(studio: HyperframesTestStudio, sha256 = SEEDED_CHROME_SHA256): Promise<string> {
  await ensureHyperframesFolders(studio.dataHomeRoot);
  const shellPath = await writePlaceholderShell(studio, PINNED_BUILD_FOLDER);
  await writeChromeFile(studio.dataHomeRoot, {
    format: HYPERFRAMES_FORMAT_VERSION,
    version: HYPERFRAMES_CHROME_VERSION,
    executablePath: shellPath,
    sha256,
    sizeBytes: 1_000,
    installedAt: '2026-11-21T09:00:00.000Z',
    installedBy: 'cli',
  });
  return shellPath;
}

export async function seedConfig(studio: HyperframesTestStudio): Promise<void> {
  await ensureHyperframesFolders(studio.dataHomeRoot);
  await writeFile(studio.paths.configFile, '{}\n');
}

/** A `trace.json` that covers the current pin, the seeded Chrome and the shipped profile. */
export function passingTrace(overrides: Partial<HyperframesTraceFile> = {}): HyperframesTraceFile {
  return {
    format: HYPERFRAMES_FORMAT_VERSION,
    result: 'pass',
    at: '2026-11-21T10:00:00.000Z',
    by: 'cli',
    pin: HYPERFRAMES_PIN,
    chromeSha256: SEEDED_CHROME_SHA256,
    profileSha256: sandboxProfile().sha256,
    templateContentHash: 'd'.repeat(64),
    controlDenied: true,
    renderExitCode: 0,
    outputOk: true,
    deniedNetwork: 0,
    ownerConfigDirDenied: 0,
    findings: [],
    ...overrides,
  };
}

export async function seedTrace(studio: HyperframesTestStudio, trace: HyperframesTraceFile = passingTrace()): Promise<void> {
  await writeTraceFile(studio.dataHomeRoot, trace);
}

export async function seedEngine(studio: HyperframesTestStudio, state: HyperframesEngineFile['state']): Promise<void> {
  await writeEngineFile(studio.dataHomeRoot, { format: HYPERFRAMES_FORMAT_VERSION, state, updatedAt: '2026-11-21T11:00:00.000Z', updatedBy: 'cli' });
}

/** Chrome, config and a covering `pass` trace: everything `enable` needs. */
export async function seedReadyFiles(studio: HyperframesTestStudio): Promise<void> {
  await seedChrome(studio);
  await seedConfig(studio);
  await seedTrace(studio);
}

/** The error a command rejected with; fails the test when it resolved. */
export async function rejectionOf(promise: Promise<number>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the command resolved instead of refusing');
}
