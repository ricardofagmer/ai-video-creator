import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { inspect } from 'node:util';
import { Module, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CqrsModule, QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type z } from 'zod';
import { type FolderFileSource, type FolderVersionSource } from '@studio/core/asset-store';
import { GetAssetVersionQuery } from '@studio/core/catalog';
import {
  HyperframesChromeMissingError,
  HyperframesPinMismatchError,
  HyperframesSandboxUnavailableError,
  type ChromeMissingDetail,
  type RecordedChromeBinary,
} from '@studio/hyperframes';
import { type AgentsPort, type ScenesOutput, type ScriptOutput } from '@studio/shared/agents';
import { type AssetVersion, type JsonObject, type TemplateDetails } from '@studio/shared/catalog';
import {
  HYPERFRAMES_CHROME_VERSION,
  HYPERFRAMES_FORMAT_VERSION,
  HYPERFRAMES_PIN,
  hyperframesPaths,
  type HyperframesEngineFiles,
  type HyperframesTraceFile,
} from '@studio/shared/hyperframes';
import type {
  AssetResolverPort,
  CostLedgerPort,
  CostRecordRequest,
  CostRecordResult,
  CredentialStatus,
  ProviderModeState,
  ResolvedAsset,
  StageEventInput,
  StageExecutionContext,
  StageExecutionResult,
  StageFailure,
  StagePlanningContext,
  UsageQuantity,
} from '@studio/shared/ports';
import { readRunFile, resolveInsideRun } from '@studio/shared/run-files';
import { type Activity, type ProviderName, type StageInput, type StageLocation } from '@studio/shared/run-format';
import { RunManifestBuilder } from '../../adapters/manifest/run-manifest.builder';
import { type HyperframesStagePorts, type RealFolder } from '../composition/hyperframes-stage.ports';
import { ToolRunner, type ToolRunOutcome } from '../process/tool-runner.client';
import { type RunnerErrorKind, type ToolRunnerRequest } from '../process/tool-runner.protocol';
import { CatalogLookup } from '../shared/catalog-lookup';
import { type LiveProviderModes } from '../shared/stage-dependencies';
import { type StageSettings } from '../shared/stage-settings';
import { CompositionExecutor } from './composition.executor';

/*
 * Test-only harness for the `composition` stage executor (SPEC 0008 R4H-FP). The real executor
 * runs against an `fs.mkdtemp` world: a run folder with the narration, script and scenes inputs,
 * a scratch root, a template folder and a data home root with no `hyperframes/` folder. Doubles sit
 * at the boundaries only: the tool runner (records every request, writes a fake output, never
 * starts a process), the HyperFrames stage ports (record every call; never the real pinned
 * package, the sandbox tool or the owner's home), the cost ledger, the provider modes, the clock
 * and SQLite (a real CQRS bus whose one query handler answers the catalog rows). Nest's logger is
 * captured for the K12 sentinel assertions (AC 81).
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');

export const STEP_KEY = 'composition:execute:1';
export const COMPOSITION_STAGE: StageLocation = { stageNumber: 8, stageId: 'composition' };
export const HYPERFRAMES_TEMPLATE_REF = 'hf-title-card@1';
export const REMOTION_TEMPLATE_REF = 'product-tour-template@1';
export const BRAND_KIT_REF = 'studio-brand@1';
export const BRAND_ACCENT = '#123abc';
export const FAKE_BIN_PATH = '/opt/studio-test/node_modules/hyperframes/bin/hyperframes.mjs';
export const FAKE_PROFILE = { path: '/opt/studio-test/sandbox/render.sb', sha256: 'b'.repeat(64) };
/** SPEC 0008 section 17.5 (rev 2): the monorepo root and the folder the fake resolves ffmpeg and ffprobe in. */
export const FAKE_STUDIO_ROOT = '/opt/studio-test';
export const FAKE_TOOLS_DIR = '/opt/studio-test/tools';
export const CHROME_SHA256 = 'a'.repeat(64);
export const RENDER_SECONDS = 12.5;
export const PRICE_PER_RENDER_SECOND = 0.01;
export const NARRATION_AUDIO_PATH = 'stages/07-narration/narration.wav';
export const PT_BR_DISCLOSURE = 'Voz gerada por IA.';

const NARRATION_INDEX_PATH = 'stages/07-narration/narration-index.json';
const SCRIPT_PATH = 'stages/04-script/script.json';
const SCENES_PATH = 'stages/06-scenes/scenes.json';
const FOLDER_MIME_TYPE = 'application/vnd.studio.folder+json';
const FIXED_NOW = new Date('2026-11-21T12:00:00.000Z');

/** The seed title card's flat schema (`seeds/templates/hyperframes/title-card.input.schema.json`). */
export const TITLE_CARD_INPUT_SCHEMA: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: { type: 'string', maxLength: 120 },
    hook: { type: 'string', maxLength: 200 },
    disclosure: { type: 'string', maxLength: 200 },
    accent: { type: 'string', format: 'color', default: '#f97316' },
    durationS: { type: 'number', default: 30 },
  },
};

/** The title card plus one non-vocabulary string and one boolean with a default (section 5.3). */
export const VARIABLES_INPUT_SCHEMA: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: { type: 'string', maxLength: 120 },
    hook: { type: 'string', maxLength: 200 },
    disclosure: { type: 'string', maxLength: 200 },
    accent: { type: 'string', format: 'color', default: '#f97316' },
    durationS: { type: 'number' },
    tagline: { type: 'string', maxLength: 200 },
    showLogo: { type: 'boolean', default: false },
  },
};

export const DEFAULT_TEMPLATE_FILES: Readonly<Record<string, string>> = {
  'index.html':
    '<!doctype html><html><head><link rel="stylesheet" href="style.css" /></head>' +
    '<body><div id="card" data-composition-id="TitleCard" data-no-timeline><h1 data-var-text="title"></h1></div></body></html>',
  'style.css': 'body { margin: 0; background: #000; }',
};

export function hyperframesDetails(overrides: Partial<TemplateDetails> = {}): TemplateDetails {
  return {
    engine: 'hyperframes',
    compositionId: 'TitleCard',
    canvas: { width: 1920, height: 1080 },
    aspect: '16:9',
    fps: 30,
    duration: { minSec: 5, maxSec: 120 },
    inputSchema: TITLE_CARD_INPUT_SCHEMA,
    sceneSchema: null,
    cameraMoves: [],
    transitions: [],
    ...overrides,
  };
}

export function remotionDetails(overrides: Partial<TemplateDetails> = {}): TemplateDetails {
  return {
    engine: 'remotion',
    compositionId: 'ProductTour16x9',
    canvas: { width: 1920, height: 1080 },
    aspect: '16:9',
    fps: 30,
    duration: { minSec: 45, maxSec: 90 },
    inputSchema: { type: 'object' },
    sceneSchema: { type: 'object' },
    cameraMoves: [],
    transitions: [],
    ...overrides,
  };
}

export function scriptFixture(overrides: Partial<ScriptOutput> = {}): ScriptOutput {
  return {
    title: 'Tour do app de exemplo',
    hook: 'Veja o app em um minuto',
    scenes: [
      { sceneId: 's1', narration: 'Primeira fala.', claimIds: [], estDurationSec: 20 },
      { sceneId: 's2', narration: 'Segunda fala.', claimIds: [], estDurationSec: 30 },
    ],
    totalEstDurationSec: 50,
    ...overrides,
  };
}

function scenesFixture(): ScenesOutput {
  return {
    scenes: [
      { sceneId: 's1', visual: { type: 'title-card', text: 'Primeira cena' }, cameraMove: 'static', transition: 'cut' },
      { sceneId: 's2', visual: { type: 'title-card', text: 'Segunda cena' }, cameraMove: 'static', transition: 'cut' },
    ],
    citedRefs: [],
  };
}

/** `chrome.json.executablePath` inside the temp data home's `cache/`; the file is never created. */
export function chromeExecutablePath(dataHomeRoot: string): string {
  return `${hyperframesPaths(dataHomeRoot).cacheDir}/chrome/headless-binary`;
}

export function readyTrace(): HyperframesTraceFile {
  return {
    format: HYPERFRAMES_FORMAT_VERSION,
    result: 'pass',
    at: '2026-11-20T10:00:00.000Z',
    by: 'owner',
    pin: HYPERFRAMES_PIN,
    chromeSha256: CHROME_SHA256,
    profileSha256: FAKE_PROFILE.sha256,
    templateContentHash: 'e'.repeat(64),
    controlDenied: true,
    renderExitCode: 0,
    outputOk: true,
    deniedNetwork: 0,
    ownerConfigDirDenied: 0,
    findings: [],
  };
}

/** Every gate file present and consistent with the fake pin, Chrome hash and profile hash. */
export function readyEngineFiles(dataHomeRoot: string): HyperframesEngineFiles {
  return {
    engine: { status: 'present', value: { format: HYPERFRAMES_FORMAT_VERSION, state: 'enabled', updatedAt: '2026-11-20T10:05:00.000Z', updatedBy: 'owner' } },
    chrome: {
      status: 'present',
      value: {
        format: HYPERFRAMES_FORMAT_VERSION,
        version: HYPERFRAMES_CHROME_VERSION,
        executablePath: chromeExecutablePath(dataHomeRoot),
        sha256: CHROME_SHA256,
        sizeBytes: 195_000_000,
        installedAt: '2026-11-20T09:00:00.000Z',
        installedBy: 'owner',
      },
    },
    chromeBinaryPresent: true,
    configSeeded: true,
    trace: { status: 'present', value: readyTrace() },
  };
}

/** One captured Nest logger call: its level and the raw arguments. */
export interface LoggerRecord {
  level: string;
  args: readonly unknown[];
}

export class CapturingLogger implements LoggerService {
  readonly records: LoggerRecord[] = [];
  readonly lines: string[] = [];

  log(...args: unknown[]): void {
    this.capture('log', args);
  }

  error(...args: unknown[]): void {
    this.capture('error', args);
  }

  warn(...args: unknown[]): void {
    this.capture('warn', args);
  }

  debug(...args: unknown[]): void {
    this.capture('debug', args);
  }

  verbose(...args: unknown[]): void {
    this.capture('verbose', args);
  }

  fatal(...args: unknown[]): void {
    this.capture('fatal', args);
  }

  private capture(level: string, args: unknown[]): void {
    this.records.push({ level, args });
    this.lines.push(inspect(args, { depth: 8 }));
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every structured log argument whose `event` field names `eventName`. */
export function eventRecords(logs: CapturingLogger, eventName: string): Record<string, unknown>[] {
  return logs.records.flatMap((record) => record.args.filter(isRecord).filter((arg) => arg.event === eventName));
}

export type FakeRunnerReply = { status: 'ok'; result: unknown } | { status: 'failed'; kind: RunnerErrorKind | 'timeout'; message: string };

function outputOf(request: ToolRunnerRequest): string | null {
  switch (request.command) {
    case 'render':
    case 'slate-render':
    case 'hyperframes-render':
      return request.output;
    default:
      return null;
  }
}

async function listFileNames(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

/** Records every request and answers it; `super.run` (the real child process) is never called. */
export class RecordingToolRunner extends ToolRunner {
  readonly requests: ToolRunnerRequest[] = [];
  /** The staged copy's file names as they were when each `hyperframes-render` request arrived. */
  readonly stagedTemplateFiles: string[][] = [];
  reply: FakeRunnerReply = { status: 'ok', result: { durationS: 50, renderSeconds: RENDER_SECONDS } };

  override async run<T>(request: ToolRunnerRequest, resultSchema: z.ZodType<T, unknown>): Promise<ToolRunOutcome<T>> {
    this.requests.push(request);
    if (request.command === 'hyperframes-render') this.stagedTemplateFiles.push(await listFileNames(request.templateDir));
    if (this.reply.status === 'failed') return { status: 'failed', kind: this.reply.kind, message: this.reply.message };
    const output = outputOf(request);
    if (output !== null) await writeFile(output, 'fake composition bytes');
    return { status: 'ok', result: resultSchema.parse(this.reply.result) };
  }
}

export function isCommand<Command extends ToolRunnerRequest['command']>(
  request: ToolRunnerRequest,
  command: Command,
): request is Extract<ToolRunnerRequest, { command: Command }> {
  return request.command === command;
}

/** The one request the runner received, which must be `command`. */
export function onlyRequest<Command extends ToolRunnerRequest['command']>(
  runner: RecordingToolRunner,
  command: Command,
): Extract<ToolRunnerRequest, { command: Command }> {
  assert.equal(runner.requests.length, 1, `expected exactly one runner request, got ${runner.requests.length}`);
  const request = runner.requests[0];
  if (request === undefined || !isCommand(request, command)) return assert.fail(`expected a ${command} request, got ${request?.command}`);
  return request;
}

async function listFolder(folder: string): Promise<FolderFileSource[]> {
  const files: FolderFileSource[] = [];
  for (const name of await listFileNames(folder)) {
    const absolutePath = join(folder, name);
    const bytes = await readFile(absolutePath);
    files.push({ relativePath: name, absolutePath, sizeBytes: bytes.byteLength, contentHash: createHash('sha256').update(bytes).digest('hex') });
  }
  return files;
}

/** The SPEC 0008 stage ports with every member answered in memory and every call recorded. */
export class RecordingHyperframesPorts implements HyperframesStagePorts {
  readonly calls: string[] = [];
  engineFiles: (dataHomeRoot: string) => Promise<HyperframesEngineFiles> = async (dataHomeRoot) => readyEngineFiles(dataHomeRoot);
  pinMismatch = false;
  sandboxToolPresent = true;
  profileUnreadable = false;
  /** Changes the folder listing (the manifest the copy is checked against) before it is returned. */
  listingEdit: (files: FolderFileSource[]) => FolderFileSource[] = (files) => files;
  /** SPEC 0008 section 17.6: when set, `verifyChromeBinary` refuses the recorded binary with this detail. */
  chromeVerifyFailure: ChromeMissingDetail | null = null;
  /** The arguments of every `verifyChromeBinary` call, in order. */
  readonly chromeVerifications: { recorded: RecordedChromeBinary; cacheDir: string }[] = [];
  /** Section 17.5: settings values (bare names or absolute paths) `resolveExecutable` finds nothing for. */
  readonly unresolvableExecutables = new Set<string>();
  /** Section 18.5: the real path `resolveExecutable` answers for a settings value, when scripted. */
  readonly resolvedExecutables = new Map<string, string>();
  /** Section 17.5: folders `realFolder` answers as `missing`. */
  readonly missingFolders = new Set<string>();
  /** Section 18.5: folders whose real path is elsewhere (a symlink), keyed by the requested path. */
  readonly redirectedFolders = new Map<string, string>();

  constructor(readonly dataHomeRoot: string) {}

  async readEngineFiles(dataHomeRoot: string): Promise<HyperframesEngineFiles> {
    this.calls.push('readEngineFiles');
    return this.engineFiles(dataHomeRoot);
  }

  pinnedBinPath(): string {
    this.calls.push('pinnedBinPath');
    if (this.pinMismatch) throw new HyperframesPinMismatchError('other-version');
    return FAKE_BIN_PATH;
  }

  sandboxProfile(): { path: string; sha256: string } {
    this.calls.push('sandboxProfile');
    if (this.profileUnreadable) throw Object.assign(new Error('sandbox profile unreadable'), { code: 'ENOENT' });
    return { ...FAKE_PROFILE };
  }

  sandboxExecExists(): boolean {
    this.calls.push('sandboxExecExists');
    return this.sandboxToolPresent;
  }

  async listTemplateFiles(source: FolderVersionSource): Promise<FolderFileSource[]> {
    this.calls.push('listTemplateFiles');
    return this.listingEdit(await listFolder(source.absolutePath));
  }

  /*
   * SPEC 0008 sections 17.5 and 17.6 (rev 2): the Chrome re-hash and the real-path resolution.
   * In memory: by default Chrome matches `chrome.json` and every path is already real, so the
   * request's paths equal the harness's own folders. `chromeVerifyFailure`,
   * `unresolvableExecutables` and `missingFolders` script the refusals.
   */
  async verifyChromeBinary(recorded: RecordedChromeBinary, options: { cacheDir: string }): Promise<void> {
    this.calls.push('verifyChromeBinary');
    this.chromeVerifications.push({ recorded, cacheDir: options.cacheDir });
    if (this.chromeVerifyFailure !== null) throw new HyperframesChromeMissingError(this.chromeVerifyFailure);
  }

  async resolveExecutable(nameOrPath: string): Promise<string> {
    if (this.unresolvableExecutables.has(nameOrPath)) throw new HyperframesSandboxUnavailableError();
    const scripted = this.resolvedExecutables.get(nameOrPath);
    if (scripted !== undefined) return scripted;
    return nameOrPath.startsWith('/') ? nameOrPath : join(FAKE_TOOLS_DIR, nameOrPath);
  }

  async realPathOfExistingPrefix(path: string): Promise<string> {
    return path;
  }

  async realPath(path: string): Promise<string> {
    return path;
  }

  async realFolder(path: string): Promise<RealFolder> {
    if (this.missingFolders.has(path)) return { status: 'missing' };
    return { status: 'present', realPath: this.redirectedFolders.get(path) ?? path };
  }

  studioRoot(): string {
    return FAKE_STUDIO_ROOT;
  }
}

export class RecordingLedger implements CostLedgerPort {
  readonly priceTableVersion = 'test-prices-1';
  readonly records: CostRecordRequest[] = [];

  priceUsd(usage: UsageQuantity): number {
    return usage.kind === 'render' ? usage.renderSeconds * PRICE_PER_RENDER_SECOND : 0;
  }

  async record(request: CostRecordRequest): Promise<CostRecordResult> {
    this.records.push(request);
    return { runTotalUsd: 0, monthToDateUsd: 0 };
  }

  async monthToDateUsd(): Promise<number> {
    return 0;
  }
}

class FakeProviderModes implements LiveProviderModes {
  constructor(private readonly renderLive: boolean) {}

  modeOf(provider: ProviderName): ProviderModeState {
    return this.isLive(provider) ? { mode: 'live' } : { mode: 'mock', fault: 'none' };
  }

  isLive(provider: ProviderName): boolean {
    return provider === 'render' && this.renderLive;
  }

  async credentialStatus(): Promise<CredentialStatus> {
    return { status: 'not-required' };
  }

  credentialFor(): never {
    throw new Error('the composition stage reads no credential');
  }
}

const unusedAgents: AgentsPort = {
  run: async (): Promise<never> => {
    throw new Error('the composition stage calls no agent');
  },
};

const unusedAssetResolver: AssetResolverPort = {
  resolve: async (): Promise<never> => {
    throw new Error('the composition stage resolves no asset');
  },
};

type VersionBase = Omit<Extract<AssetVersion, { kind: 'brand-kit' }>, 'kind' | 'details'>;

function versionBase(id: string, contentHash: string): VersionBase {
  return {
    id,
    name: id,
    summary: '',
    version: 1,
    status: 'active',
    tags: [],
    owner: 'owner',
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    contentHash,
    sizeBytes: 1,
    mimeType: 'application/json',
    layout: 'file',
    storage: { mode: 'store' },
    provenance: null,
    license: null,
    sensitivity: 'normal',
    usageCount: 0,
    qualityScore: null,
    qualitySampleSize: 0,
    qualityPlatformSampleSize: 0,
    qualityScoredAt: null,
    notes: '',
    purpose: '',
    purposeSource: 'none',
  };
}

function brandKitVersion(): AssetVersion {
  return {
    ...versionBase('studio-brand', 'f'.repeat(64)),
    kind: 'brand-kit',
    details: {
      colors: [
        { name: 'accent', hex: BRAND_ACCENT },
        { name: 'ink', hex: '#000000' },
      ],
      fonts: [],
      logoRefs: [],
      captionStyle: { fontFamily: 'Inter', fontSizePx: 48, color: '#ffffff', background: null, maxLines: 2 },
      safeZones: [],
      tagHints: [],
      toneOfVoice: '',
      motionStyle: '',
    },
  };
}

function templateVersion(asset: ResolvedAsset, details: TemplateDetails): AssetVersion {
  return {
    ...versionBase(asset.ref.split('@')[0] ?? 'template', asset.contentHash),
    kind: 'template',
    layout: 'folder',
    mimeType: FOLDER_MIME_TYPE,
    storage: { mode: 'reference', absolutePath: asset.absolutePath },
    details,
  };
}

@Module({})
class CompositionCatalogTestModule {}

/** A real CQRS bus whose one handler answers `GetAssetVersionQuery` from memory (SQLite is never reached). */
function catalogHandler(versions: ReadonlyMap<string, AssetVersion>, reads: string[]): new () => IQueryHandler<GetAssetVersionQuery, AssetVersion> {
  @QueryHandler(GetAssetVersionQuery)
  class GetAssetVersionHandler implements IQueryHandler<GetAssetVersionQuery, AssetVersion> {
    async execute(query: GetAssetVersionQuery): Promise<AssetVersion> {
      reads.push(query.ref);
      const version = versions.get(query.ref);
      if (version === undefined) throw new Error(`unknown asset ${query.ref}`);
      return version;
    }
  }
  return GetAssetVersionHandler;
}

async function writeRunJson(runDir: string, relativePath: string, value: unknown): Promise<void> {
  const target = resolveInsideRun(runDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function stageInput(name: string, fromStage: StageInput['fromStage'], path: string): StageInput {
  return { name, fromStage, path, contentHash: 'c'.repeat(64) };
}

export interface CompositionHarnessOptions {
  /** The `render` provider is live (default) or mock. */
  renderLive?: boolean;
  template?: TemplateDetails;
  templateFiles?: Readonly<Record<string, string>>;
  /** A brand kit is bound next to the template (default true). */
  brandKit?: boolean;
  script?: ScriptOutput;
  narrationS?: number;
  /** The composition stage's recipe `params`. */
  params?: JsonObject;
  /** Folder names under the temp root; tests put sentinel strings in them (AC 81). */
  scratchDirName?: string;
  dataHomeDirName?: string;
  /** The studio ports in the stage settings (default api 4311, web 4310; SPEC 0008 section 17.5). */
  studioPorts?: StageSettings['studioPorts'];
}

export interface CompositionHarness {
  root: string;
  dataHomeRoot: string;
  scratchRoot: string;
  ownerHome: string;
  runDir: string;
  templateRef: string;
  compositionOutputPath: string;
  runner: RecordingToolRunner;
  ports: RecordingHyperframesPorts;
  ledger: RecordingLedger;
  logs: CapturingLogger;
  catalogReads: string[];
  activities: Omit<Activity, 'atMs'>[];
  events: StageEventInput[];
  context: StageExecutionContext;
  execute(): Promise<StageExecutionResult>;
  close(): Promise<void>;
}

export async function createCompositionHarness(options: CompositionHarnessOptions = {}): Promise<CompositionHarness> {
  const root = await mkdtemp(join(tmpdir(), 'watcher-composition-'));
  const dataHomeRoot = join(root, options.dataHomeDirName ?? 'data-home');
  const scratchRoot = join(root, options.scratchDirName ?? 'scratch');
  const ownerHome = join(root, 'owner-home');
  const templateSource = join(root, 'template-source');
  const run = await readRunFile(FIXTURE_DIR);
  const runDir = join(root, 'runs', run.runId);
  await Promise.all([mkdir(dataHomeRoot, { recursive: true }), mkdir(scratchRoot, { recursive: true }), mkdir(templateSource, { recursive: true })]);
  for (const [name, text] of Object.entries(options.templateFiles ?? DEFAULT_TEMPLATE_FILES)) await writeFile(join(templateSource, name), text);

  const template = options.template ?? hyperframesDetails();
  const templateRef = template.engine === 'hyperframes' ? HYPERFRAMES_TEMPLATE_REF : REMOTION_TEMPLATE_REF;
  const narrationS = options.narrationS ?? 50;
  await writeRunJson(runDir, NARRATION_INDEX_PATH, {
    format: 1,
    engine: 'mock',
    durationS: narrationS,
    audioPath: NARRATION_AUDIO_PATH,
    sceneTimings: [
      { sceneId: 's1', startS: 0, endS: narrationS * 0.4 },
      { sceneId: 's2', startS: narrationS * 0.4, endS: narrationS },
    ],
    words: [],
    characters: 100,
  });
  await writeFile(resolveInsideRun(runDir, NARRATION_AUDIO_PATH), 'fake narration bytes');
  await writeRunJson(runDir, SCRIPT_PATH, options.script ?? scriptFixture());
  await writeRunJson(runDir, SCENES_PATH, scenesFixture());

  const templateAsset: ResolvedAsset = {
    ref: templateRef,
    kind: 'template',
    assetStatus: 'active',
    contentHash: createHash('sha256').update(templateRef).digest('hex'),
    sizeBytes: 1024,
    mimeType: FOLDER_MIME_TYPE,
    layout: 'folder',
    sensitivity: 'normal',
    license: null,
    storage: 'reference',
    absolutePath: templateSource,
  };
  const brandKitAsset: ResolvedAsset = {
    ref: BRAND_KIT_REF,
    kind: 'brand-kit',
    assetStatus: 'active',
    contentHash: 'f'.repeat(64),
    sizeBytes: 512,
    mimeType: 'application/json',
    layout: 'file',
    sensitivity: 'normal',
    license: null,
    storage: 'store',
    absolutePath: join(root, 'store', 'brand-kit.json'),
  };
  const withBrandKit = options.brandKit ?? true;
  const assets = withBrandKit ? [templateAsset, brandKitAsset] : [templateAsset];
  const versions = new Map<string, AssetVersion>([[templateRef, templateVersion(templateAsset, template)]]);
  if (withBrandKit) versions.set(BRAND_KIT_REF, brandKitVersion());

  const logs = new CapturingLogger();
  const catalogReads: string[] = [];
  const app = await NestFactory.createApplicationContext(
    { module: CompositionCatalogTestModule, imports: [CqrsModule.forRoot()], providers: [catalogHandler(versions, catalogReads)] },
    // abortOnError false: a resolution failure fails the test instead of exiting the process.
    { logger: logs, abortOnError: false },
  );

  const settings: StageSettings = {
    path: '/usr/bin:/bin',
    home: ownerHome,
    tmpDir: scratchRoot,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    ytDlpPath: 'yt-dlp',
    localVoice: null,
    elevenLabs: { voiceId: null, modelId: 'eleven_multilingual_v2' },
    studioPorts: options.studioPorts ?? { api: 4311, web: 4310 },
  };
  const runner = new RecordingToolRunner(settings);
  const ports = new RecordingHyperframesPorts(dataHomeRoot);
  const ledger = new RecordingLedger();
  const executor = new CompositionExecutor({
    agents: unusedAgents,
    ledger,
    providerModes: new FakeProviderModes(options.renderLive ?? true),
    clock: { now: () => FIXED_NOW },
    settings,
    runner,
    catalog: new CatalogLookup(app.get(QueryBus)),
    assetResolver: unusedAssetResolver,
    manifestBuilder: new RunManifestBuilder(),
    hyperframes: ports,
    referenceAnalyses: { readDone: async () => [] },
  });

  const params = options.params ?? {};
  const planning: StagePlanningContext = {
    runId: run.runId,
    stage: COMPOSITION_STAGE,
    brief: run.brief,
    recipe: run.recipe.definition,
    recipePin: { ref: run.recipe.ref, contentHash: run.recipe.contentHash },
    limits: run.limits,
    params,
  };
  const declaredOutputs = executor.declaredOutputs(planning);
  const composition = declaredOutputs.find((output) => output.name === 'composition');
  if (composition === undefined) throw new Error('the composition stage declares no composition output');
  const inputs = [
    stageInput('narration-index', 'narration', NARRATION_INDEX_PATH),
    stageInput('script', 'script', SCRIPT_PATH),
    stageInput('scenes', 'scenes', SCENES_PATH),
  ];
  const activities: Omit<Activity, 'atMs'>[] = [];
  const events: StageEventInput[] = [];
  const context: StageExecutionContext = {
    ...planning,
    runDir,
    attempt: 1,
    stepKey: STEP_KEY,
    stageBrief: {
      runId: run.runId,
      stageNumber: COMPOSITION_STAGE.stageNumber,
      stageId: 'composition',
      phaseId: 'post',
      title: 'Composição',
      templateId: 'composition',
      renderedAt: FIXED_NOW.toISOString(),
      instructions: '',
      bindings: withBrandKit
        ? [
            { slot: 'template', ref: templateRef },
            { slot: 'brand-kit', ref: BRAND_KIT_REF },
          ]
        : [{ slot: 'template', ref: templateRef }],
      inputs,
      checks: ['outputs-present'],
      declaredOutputs: [...declaredOutputs],
    },
    inputManifest: {
      runId: run.runId,
      stageNumber: COMPOSITION_STAGE.stageNumber,
      stageId: 'composition',
      attempt: 1,
      createdAt: FIXED_NOW.toISOString(),
      briefHash: 'd'.repeat(64),
      assets: [],
      inputs,
      parameters: params,
      models: [],
    },
    assets,
    correlationId: null,
    signal: new AbortController().signal,
    report: (activity) => {
      activities.push(activity);
    },
    events: {
      emit: async (event) => {
        events.push(event);
      },
    },
  };

  return {
    root,
    dataHomeRoot,
    scratchRoot,
    ownerHome,
    runDir,
    templateRef,
    compositionOutputPath: resolveInsideRun(runDir, composition.path),
    runner,
    ports,
    ledger,
    logs,
    catalogReads,
    activities,
    events,
    context,
    execute: () => executor.execute(context),
    close: async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** The failure of a result that must have failed. */
export function failureOf(result: StageExecutionResult): StageFailure {
  if (result.status !== 'failed') return assert.fail(`expected a failed stage, got ${result.status}`);
  return result.failure;
}

/** The owner-facing stop of a result that must be `needs-person`. */
export function needsPersonOf(result: StageExecutionResult): Extract<StageFailure, { class: 'needs-person' }> {
  const failure = failureOf(result);
  if (failure.class !== 'needs-person') return assert.fail(`expected needs-person, got ${failure.class}`);
  return failure;
}
