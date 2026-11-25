import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CqrsModule, QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type z } from 'zod';
import { AgentRunError, type AgentFailure } from '@studio/core/agents';
import { GetAssetVersionQuery } from '@studio/core/catalog';
import {
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  WRITER_ROLE,
  PlanOutputSchema,
  ScenesOutputSchema,
  ScriptOutputSchema,
  type AgentOutput,
  type AgentPacket,
  type AgentRunOptions,
  type AgentsPort,
  type ModelRoleName,
} from '@studio/shared/agents';
import { type AssetVersion } from '@studio/shared/catalog';
import type {
  CredentialStatus,
  MockFaultScenario,
  ProviderModeState,
  ResolvedAsset,
  StageEventInput,
  StageExecutionContext,
  StageExecutionResult,
  StageExecutorPort,
  StagePlanningContext,
} from '@studio/shared/ports';
import { type Brief } from '@studio/shared/recipes';
import {
  readCostFile,
  readEgressEntries,
  readJsonFile,
  readRunFile,
  readRunManifest,
  resolveInsideRun,
  runDirectory,
  writeRunFile,
} from '@studio/shared/run-files';
import {
  QaMetricsSchema,
  StageIdSchema,
  runFileNames,
  stagePhase,
  stageWorkPath,
  type ProviderName,
  type QaMetrics,
  type RunFile,
  type StageId,
  type StageInput,
} from '@studio/shared/run-format';
import { RunManifestBuilder } from '../../adapters/manifest/run-manifest.builder';
import { ManifestAssetUnverifiedError } from '../../adapters/manifest/run-manifest.mapper';
import { DuplicateStageExecutorError, MissingStageExecutorError } from '../../engine/engine.errors';
import { ExecutorRegistry } from '../../engine/executor-registry';
import { mockScript } from '../../mocks/fixtures/agent-output.fixtures';
import { MockAgentsService } from '../../mocks/mock-agents.service';
import { MockAssetResolver } from '../../mocks/mock-asset-resolver';
import { createWatcherHome } from '../../test-support/index';
import { claimsFromKeyMessages } from '../executors/claim-evidence';
import { RecordingHyperframesPorts, RecordingLedger, failureOf, needsPersonOf, remotionDetails } from '../executors/composition-stage.harness.test';
import { ToolRunner, type ToolRunOutcome } from '../process/tool-runner.client';
import { MediaReviewResultSchema, type RunnerErrorKind, type ToolRunnerRequest } from '../process/tool-runner.protocol';
import { CatalogLookup } from '../shared/catalog-lookup';
import { type LiveProviderModes } from '../shared/stage-dependencies';
import { type StageSettings } from '../shared/stage-settings';
import {
  CapturesIndexSchema,
  ClaimsArtifactSchema,
  NarrationIndexSchema,
  PlanSourceSchema,
  QaSubjectSchema,
  ResearchArtifactSchema,
  ReviewOutcomeSchema,
} from '../shared/stage-artifacts';
import { createStageExecutors } from '../stage-executors.factory';

/*
 * Ticket 03 acceptance criterion 1 (CR3): every stage executor the factory binds to the
 * `ExecutorRegistry` passes one case under mock ports and returns its typed failure in another.
 * The real executors run against a temp watcher home holding a copy of the committed fixture run.
 * Doubles sit at the boundaries only: the tool runner (records requests, writes fake bytes, never
 * starts a process), the agents port (the in-process mock agents, or a scripted `AgentRunError`),
 * the provider modes, the cost ledger, the clock and the catalog (a real CQRS bus answering from
 * memory). No binary, provider, network or owner folder is reached.
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');
const FIXED_NOW = new Date('2026-11-21T12:00:00.000Z');
const FOLDER_MIME_TYPE = 'application/vnd.studio.folder+json';
const VIDEO_BYTES = 'fake video bytes';
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

type RunnerCommand = ToolRunnerRequest['command'];
type RunnerFailure = { kind: RunnerErrorKind | 'timeout'; message: string };
type StageBriefOf = StageExecutionContext['stageBrief'];

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function stageNumberOf(stageId: StageId): number {
  return StageIdSchema.options.indexOf(stageId) + 1;
}

function stageLocation(stageId: StageId): { stageNumber: number; stageId: StageId } {
  return { stageNumber: stageNumberOf(stageId), stageId };
}

function passingMediaReview(): z.infer<typeof MediaReviewResultSchema> {
  return {
    passed: true,
    checks: [],
    measured: {
      containerNames: ['mov', 'mp4'],
      durationS: 58,
      video: { codec: 'h264', width: 1920, height: 1080, fps: 30 },
      audio: { codec: 'aac', sampleRate: 48000 },
      integratedLufs: -16,
      truePeakDbfs: -1.5,
      blackRuns: [],
    },
  };
}

function defaultResult(command: RunnerCommand): unknown {
  switch (command) {
    case 'page-text':
      return { title: 'Página de exemplo', text: 'catálogo. receitas. execução.', truncated: false };
    case 'narration-assemble':
      return {
        durationS: 12,
        sceneTimings: [{ sceneId: 's1', startS: 0, endS: 12 }],
        words: [{ text: 'Catálogo', startS: 0, endS: 0.8 }],
      };
    case 'media-review':
      return passingMediaReview();
    default:
      return { durationS: 20, renderSeconds: 0 };
  }
}

/** Records every request and answers it; `super.run` (the real child process) is never called. */
class ScriptedToolRunner extends ToolRunner {
  readonly requests: ToolRunnerRequest[] = [];
  readonly failures = new Map<RunnerCommand, RunnerFailure>();
  readonly results = new Map<RunnerCommand, unknown>();

  override async run<T>(request: ToolRunnerRequest, resultSchema: z.ZodType<T, unknown>): Promise<ToolRunOutcome<T>> {
    this.requests.push(request);
    const failure = this.failures.get(request.command);
    if (failure !== undefined) return { status: 'failed', kind: failure.kind, message: failure.message };
    if ('output' in request) await writeFile(request.output, `fake ${request.command} bytes`);
    return { status: 'ok', result: resultSchema.parse(this.results.get(request.command) ?? defaultResult(request.command)) };
  }

  requestsOf<Command extends RunnerCommand>(command: Command): Extract<ToolRunnerRequest, { command: Command }>[] {
    return this.requests.filter((request): request is Extract<ToolRunnerRequest, { command: Command }> => request.command === command);
  }
}

class ScriptedProviderModes implements LiveProviderModes {
  fault: MockFaultScenario = 'none';
  readonly live = new Set<ProviderName>();

  modeOf(provider: ProviderName): ProviderModeState {
    return this.live.has(provider) ? { mode: 'live' } : { mode: 'mock', fault: this.fault };
  }

  isLive(provider: ProviderName): boolean {
    return this.live.has(provider);
  }

  async credentialStatus(): Promise<CredentialStatus> {
    return { status: 'not-required' };
  }

  credentialFor(): never {
    throw new Error('stage executor tests read no credential');
  }
}

/** The in-process mock agents, except for roles scripted to fail with an `AgentRunError`. */
class ScriptedAgents implements AgentsPort {
  readonly calls: ModelRoleName[] = [];
  readonly failures = new Map<ModelRoleName, AgentFailure>();
  private readonly mockAgents = new MockAgentsService();

  async run<Role extends ModelRoleName>(role: Role, packet: AgentPacket<Role>, options?: AgentRunOptions): Promise<AgentOutput<Role>> {
    this.calls.push(role);
    const failure = this.failures.get(role);
    if (failure !== undefined) throw new AgentRunError(role, failure);
    return this.mockAgents.run(role, packet, options);
  }
}

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

@Module({})
class StageCatalogTestModule {}

function catalogHandler(versions: ReadonlyMap<string, AssetVersion>): new () => IQueryHandler<GetAssetVersionQuery, AssetVersion> {
  @QueryHandler(GetAssetVersionQuery)
  class GetAssetVersionHandler implements IQueryHandler<GetAssetVersionQuery, AssetVersion> {
    async execute(query: GetAssetVersionQuery): Promise<AssetVersion> {
      const version = versions.get(query.ref);
      if (version === undefined) throw new Error(`unknown asset ${query.ref}`);
      return version;
    }
  }
  return GetAssetVersionHandler;
}

interface StageWorld {
  root: string;
  runDir: string;
  run: RunFile;
  runner: ScriptedToolRunner;
  modes: ScriptedProviderModes;
  ledger: RecordingLedger;
  agents: ScriptedAgents;
  versions: Map<string, AssetVersion>;
  events: StageEventInput[];
  executors: readonly StageExecutorPort[];
  registry: ExecutorRegistry;
  close(): Promise<void>;
}

async function createStageWorld(): Promise<StageWorld> {
  const home = await createWatcherHome({ prefix: 'stage-executors' });
  const scratch = join(home.root, 'scratch');
  const ownerHome = join(home.root, 'owner-home');
  await Promise.all([mkdir(scratch, { recursive: true }), mkdir(ownerHome, { recursive: true })]);
  const run = await readRunFile(FIXTURE_DIR);
  const runDir = runDirectory(join(home.root, 'runs'), run.runId);
  await writeRunFile(runDir, run);

  const versions = new Map<string, AssetVersion>();
  let app: INestApplicationContext;
  try {
    app = await NestFactory.createApplicationContext(
      { module: StageCatalogTestModule, imports: [CqrsModule.forRoot()], providers: [catalogHandler(versions)] },
      // abortOnError false: a resolution failure fails the test instead of exiting the process.
      { logger: false, abortOnError: false },
    );
  } catch (error) {
    await home.close();
    throw error;
  }
  const settings: StageSettings = {
    path: '/usr/bin:/bin',
    home: ownerHome,
    tmpDir: scratch,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    ytDlpPath: 'yt-dlp',
    localVoice: null,
    elevenLabs: { voiceId: null, modelId: 'eleven_multilingual_v2' },
    studioPorts: { api: 4311, web: 4310 },
  };
  const runner = new ScriptedToolRunner(settings);
  const modes = new ScriptedProviderModes();
  const ledger = new RecordingLedger();
  const agents = new ScriptedAgents();
  const executors = createStageExecutors({
    agents,
    ledger,
    providerModes: modes,
    clock: { now: () => FIXED_NOW },
    settings,
    runner,
    catalog: new CatalogLookup(app.get(QueryBus)),
    assetResolver: new MockAssetResolver(),
    manifestBuilder: new RunManifestBuilder(),
    hyperframes: new RecordingHyperframesPorts(join(home.root, 'data-home')),
    referenceAnalyses: { readDone: async () => [] },
  });
  return {
    root: home.root,
    runDir,
    run,
    runner,
    modes,
    ledger,
    agents,
    versions,
    events: [],
    executors,
    registry: new ExecutorRegistry(executors),
    close: async () => {
      try {
        await app.close();
      } finally {
        await home.close();
      }
    },
  };
}

interface ContextOptions {
  inputs?: StageInput[];
  bindings?: StageBriefOf['bindings'];
  assets?: ResolvedAsset[];
  checks?: StageBriefOf['checks'];
  brief?: Brief;
  signal?: AbortSignal;
}

function contextFor(world: StageWorld, stageId: StageId, options: ContextOptions = {}): StageExecutionContext {
  const executor = world.registry.forStage(stageId);
  const stage = stageLocation(stageId);
  const planning: StagePlanningContext = {
    runId: world.run.runId,
    stage,
    brief: options.brief ?? world.run.brief,
    recipe: world.run.recipe.definition,
    recipePin: { ref: world.run.recipe.ref, contentHash: world.run.recipe.contentHash },
    limits: world.run.limits,
    params: {},
  };
  const declaredOutputs = [...executor.declaredOutputs(planning)];
  const inputs = options.inputs ?? [];
  return {
    ...planning,
    runDir: world.runDir,
    attempt: 1,
    stepKey: `${stageId}:execute:1`,
    stageBrief: {
      runId: world.run.runId,
      stageNumber: stage.stageNumber,
      stageId,
      phaseId: stagePhase[stageId],
      title: `Etapa ${stageId}`,
      templateId: stageId,
      renderedAt: FIXED_NOW.toISOString(),
      instructions: '',
      bindings: options.bindings ?? [],
      inputs,
      checks: options.checks ?? [],
      declaredOutputs,
    },
    inputManifest: {
      runId: world.run.runId,
      stageNumber: stage.stageNumber,
      stageId,
      attempt: 1,
      createdAt: FIXED_NOW.toISOString(),
      briefHash: 'd'.repeat(64),
      assets: [],
      inputs,
      parameters: {},
      models: [],
    },
    assets: options.assets ?? [],
    correlationId: null,
    signal: options.signal ?? new AbortController().signal,
    report: () => undefined,
    events: {
      emit: async (event) => {
        world.events.push(event);
      },
    },
  };
}

async function execute(world: StageWorld, stageId: StageId, options: ContextOptions = {}): Promise<StageExecutionResult> {
  return world.registry.forStage(stageId).execute(contextFor(world, stageId, options));
}

/** Writes an earlier stage's output into its work folder and returns it as a pinned stage input. */
async function writeInput(world: StageWorld, input: { name: string; fromStage: StageId; file: string; content: string | object }): Promise<StageInput> {
  const path = stageWorkPath(stageLocation(input.fromStage), input.file);
  const target = resolveInsideRun(world.runDir, path);
  await mkdir(dirname(target), { recursive: true });
  const bytes = typeof input.content === 'string' ? input.content : `${JSON.stringify(input.content, null, 2)}\n`;
  await writeFile(target, bytes);
  return { name: input.name, fromStage: input.fromStage, path, contentHash: sha256(bytes) };
}

function stageFile(world: StageWorld, stageId: StageId, file: string): string {
  return resolveInsideRun(world.runDir, stageWorkPath(stageLocation(stageId), file));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function briefWithoutSource(brief: Brief): Brief {
  const copy = { ...brief };
  delete copy.sourceUrl;
  return copy;
}

function resolvedAsset(overrides: Pick<ResolvedAsset, 'ref' | 'kind' | 'contentHash' | 'absolutePath'> & Partial<ResolvedAsset>): ResolvedAsset {
  return {
    assetStatus: 'active',
    sizeBytes: 64,
    mimeType: 'application/json',
    layout: 'file',
    sensitivity: 'normal',
    license: null,
    storage: 'store',
    ...overrides,
  };
}

function bindingHash(world: StageWorld, ref: string): string {
  const binding = world.run.recipe.definition.bindings.find((candidate) => candidate.ref === ref);
  if (binding === undefined) return assert.fail(`the fixture recipe binds no ${ref}`);
  return binding.contentHash;
}

async function narrationInput(world: StageWorld): Promise<StageInput[]> {
  const audioPath = stageWorkPath(stageLocation('narration'), 'narration.wav');
  const audio = resolveInsideRun(world.runDir, audioPath);
  await mkdir(dirname(audio), { recursive: true });
  await writeFile(audio, 'fake narration bytes');
  const index = await writeInput(world, {
    name: 'narration-index',
    fromStage: 'narration',
    file: 'narration.json',
    content: {
      format: 1,
      engine: 'mock',
      durationS: 12,
      audioPath,
      sceneTimings: [{ sceneId: 's1', startS: 0, endS: 12 }],
      words: [
        { text: 'Catálogo', startS: 0, endS: 0.8 },
        { text: 'receitas', startS: 0.9, endS: 1.6 },
      ],
      characters: 100,
    },
  });
  return [index];
}

async function videoInput(world: StageWorld, name: 'composition' | 'music' = 'composition', bytes: string = VIDEO_BYTES): Promise<StageInput> {
  return writeInput(world, { name, fromStage: name, file: `${name}.mp4`, content: bytes });
}

function qaMetrics(): QaMetrics {
  return QaMetricsSchema.parse({
    container: 'mov',
    videoCodec: 'h264',
    durationMs: 58000,
    width: 1920,
    height: 1080,
    fps: 30,
    audio: { status: 'present', codec: 'aac', integratedLufs: -16, truePeakDbtp: -1.5 },
    blackRuns: [],
    captionMaxDriftMs: null,
  });
}

beforeEach(() => {
  for (const level of logLevels) mock.method(Logger.prototype, level, (): void => undefined);
});

afterEach(() => {
  mock.restoreAll();
});

describe('stage executors under mock ports (ticket 03 criterion 1)', () => {
  let world: StageWorld;

  beforeEach(async () => {
    world = await createStageWorld();
  });

  afterEach(async () => {
    await world.close();
  });

  describe('executor registry', () => {
    it('binds one real executor to every stage id in the vocabulary', () => {
      assert.equal(world.executors.length, StageIdSchema.options.length);
      for (const stageId of StageIdSchema.options) assert.equal(world.registry.forStage(stageId).stageId, stageId);
    });

    it('refuses a second executor for the same stage at construction', () => {
      const duplicate = world.registry.forStage('plan');

      assert.throws(() => new ExecutorRegistry([...world.executors, duplicate]), DuplicateStageExecutorError);
    });

    it('refuses a stage with no bound executor at first use', () => {
      const registry = new ExecutorRegistry(world.executors.filter((executor) => executor.stageId !== 'qa'));

      assert.throws(() => registry.forStage('qa'), MissingStageExecutorError);
    });
  });

  describe('mock call faults of the non-agent stages', () => {
    const faultedStages: readonly { stageId: StageId; provider: ProviderName }[] = [
      { stageId: 'research', provider: 'capture' },
      { stageId: 'verify', provider: 'capture' },
      { stageId: 'capture', provider: 'capture' },
      { stageId: 'narration', provider: 'elevenlabs' },
      { stageId: 'composition', provider: 'render' },
      { stageId: 'captions', provider: 'render' },
      { stageId: 'fades', provider: 'render' },
      { stageId: 'music', provider: 'render' },
      { stageId: 'qa', provider: 'render' },
      { stageId: 'package', provider: 'render' },
    ];

    for (const { stageId, provider } of faultedStages) {
      it(`fails ${stageId} as a retryable tool failure under the step-failure fault`, async () => {
        world.modes.fault = 'step-failure';

        const failure = failureOf(await execute(world, stageId));

        assert.equal(failure.class, 'retryable');
        assert.equal(failure.class === 'retryable' ? failure.kind : null, 'tool');
        assert.deepEqual(world.runner.requests, []);
      });

      it(`fails ${stageId} as an authentication failure of ${provider} under the authentication-error fault`, async () => {
        world.modes.fault = 'authentication-error';

        const failure = failureOf(await execute(world, stageId));

        assert.equal(failure.class, 'authentication');
        assert.equal(failure.class === 'authentication' ? failure.provider : null, provider);
        assert.deepEqual(world.runner.requests, []);
      });
    }

    it('leaves the plan stage to the agents when the step-failure fault is active', async () => {
      world.modes.fault = 'step-failure';

      const result = await execute(world, 'plan');

      assert.equal(result.status, 'reported-success');
      assert.deepEqual(world.agents.calls, [PLANNER_ROLE]);
    });

    it('omits the first declared output while reporting success under the missing-output fault', async () => {
      world.modes.fault = 'missing-output';
      const video = await videoInput(world);

      const result = await execute(world, 'fades', { inputs: [video] });

      assert.equal(result.status, 'reported-success');
      assert.equal(world.runner.requestsOf('fades').length, 1);
      assert.equal(await pathExists(stageFile(world, 'fades', 'fades.mp4')), false);
    });

    it('rejects an execution whose signal is already aborted before any tool runs', async () => {
      const controller = new AbortController();
      controller.abort();
      const video = await videoInput(world);

      await assert.rejects(execute(world, 'fades', { inputs: [video], signal: controller.signal }), { name: 'AbortError' });
      assert.deepEqual(world.runner.requests, []);
    });
  });

  describe('plan', () => {
    it('records the planner plan with a planner plan-source', async () => {
      const result = await execute(world, 'plan');

      assert.equal(result.status, 'reported-success');
      assert.deepEqual(world.agents.calls, [PLANNER_ROLE]);
      const source = await readJsonFile(stageFile(world, 'plan', 'plan-source.json'), PlanSourceSchema);
      assert.deepEqual(source, { format: 1, source: 'planner', warning: null });
      await readJsonFile(stageFile(world, 'plan', 'plan.json'), PlanOutputSchema);
    });

    it('fails with the claude authentication failure when the planner credential is refused', async () => {
      world.agents.failures.set(PLANNER_ROLE, { kind: 'provider', failure: { class: 'authentication', provider: 'claude' } });

      const failure = failureOf(await execute(world, 'plan'));

      assert.deepEqual(failure, { class: 'authentication', provider: 'claude', message: 'Provider claude rejected the credential' });
      assert.equal(await pathExists(stageFile(world, 'plan', 'plan.json')), false);
    });

    it('falls back to the recipe default plan with a warning when the planner times out', async () => {
      world.agents.failures.set(PLANNER_ROLE, { kind: 'timeout' });

      const result = await execute(world, 'plan');

      assert.equal(result.status, 'reported-success');
      const source = await readJsonFile(stageFile(world, 'plan', 'plan-source.json'), PlanSourceSchema);
      assert.equal(source.source, 'recipe-default');
      assert.ok(source.warning !== null && source.warning.length > 0, 'the fallback carries no warning');
      const plan = await readJsonFile(stageFile(world, 'plan', 'plan.json'), PlanOutputSchema);
      assert.equal(plan.risks[0], source.warning);
    });
  });

  describe('research', () => {
    it('builds a labelled mock page from the brief key messages without a connection', async () => {
      const result = await execute(world, 'research');

      assert.equal(result.status, 'reported-success');
      const research = await readJsonFile(stageFile(world, 'research', 'research.json'), ResearchArtifactSchema);
      assert.equal(research.mode, 'mock');
      for (const message of world.run.brief.keyMessages) assert.ok(research.text.includes(`${message}.`), `missing key message ${message}`);
      assert.deepEqual(world.runner.requests, []);
    });

    it('stops for the owner when a live capture targets a non-https page', async () => {
      world.modes.live.add('capture');
      // Plain http is read only on a local-network host (owner decision, 2026-11-24); a public host must be https.
      const brief: Brief = { ...world.run.brief, sourceUrl: 'http://app.example.test/tour' };

      const failure = needsPersonOf(await execute(world, 'research', { brief }));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.runner.requests, []);
    });

    it('records the page fetch in egress and retries a timed-out live page read', async () => {
      world.modes.live.add('capture');
      world.runner.failures.set('page-text', { kind: 'timeout', message: 'page read timed out' });
      const brief: Brief = { ...world.run.brief, sourceUrl: 'https://app.example.test/tour' };

      const failure = failureOf(await execute(world, 'research', { brief }));

      assert.equal(failure.class, 'retryable');
      assert.equal(failure.class === 'retryable' ? failure.kind : null, 'timeout');
      const egress = await readEgressEntries(world.runDir);
      assert.deepEqual(
        egress.entries.map((entry) => entry.what),
        ['page-fetch'],
      );
    });

    it('records a no-source research artifact when the brief has no source url', async () => {
      const result = await execute(world, 'research', { brief: briefWithoutSource(world.run.brief) });

      assert.equal(result.status, 'reported-success');
      const research = await readJsonFile(stageFile(world, 'research', 'research.json'), ResearchArtifactSchema);
      assert.equal(research.mode, 'no-source');
    });
  });

  describe('verify', () => {
    it('verifies every key message found in the research text', async () => {
      const research = await writeInput(world, {
        name: 'research',
        fromStage: 'research',
        file: 'research.json',
        content: { format: 1, mode: 'mock', sourceUrl: null, title: 'Simulado', text: 'Tema. catálogo. receitas. execução.', truncated: false },
      });

      const result = await execute(world, 'verify', { inputs: [research] });

      assert.equal(result.status, 'reported-success');
      const claims = await readJsonFile(stageFile(world, 'verify', 'claims.json'), ClaimsArtifactSchema);
      assert.deepEqual(
        claims.claims.map((claim) => claim.status),
        ['verified', 'verified', 'verified'],
      );
    });

    it('drops key messages no research backs and continues', async () => {
      const result = await execute(world, 'verify');

      assert.equal(result.status, 'reported-success');
      const claims = await readJsonFile(stageFile(world, 'verify', 'claims.json'), ClaimsArtifactSchema);
      assert.deepEqual(claims.claims, []);
      assert.match(result.status === 'reported-success' ? result.summary : '', /Removida\(s\) por falta de evidência/);
    });

    it('passes claims-evidence after dropping unbacked key messages', async () => {
      const context = contextFor(world, 'verify', { checks: ['claims-evidence'] });
      const executor = world.registry.forStage('verify');

      const result = await executor.execute(context);
      const checks = await executor.verify(context);

      assert.equal(result.status, 'reported-success');
      assert.equal(checks.find((check) => check.checkId === 'claims-evidence')?.outcome, 'passed');
    });
  });

  describe('script', () => {
    async function writerPrompt(): Promise<{ asset: ResolvedAsset; binding: { slot: string; ref: string } }> {
      const absolutePath = join(world.root, 'store', 'writer-prompt.txt');
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, 'Escreva um roteiro curto e claro.');
      const asset = resolvedAsset({ ref: 'writer-prompt@1', kind: 'prompt', contentHash: bindingHash(world, 'writer-prompt@1'), absolutePath, mimeType: 'text/plain' });
      return { asset, binding: { slot: 'prompt:writer', ref: 'writer-prompt@1' } };
    }

    async function claimsInput(): Promise<StageInput> {
      return writeInput(world, {
        name: 'claims',
        fromStage: 'verify',
        file: 'claims.json',
        content: { format: 1, claims: claimsFromKeyMessages(world.run.brief.keyMessages, 'catálogo. receitas. execução.') },
      });
    }

    it('writes the reviewed script with the writer prompt bound', async () => {
      const prompt = await writerPrompt();
      const claims = await claimsInput();

      const result = await execute(world, 'script', { inputs: [claims], bindings: [prompt.binding], assets: [prompt.asset] });

      assert.equal(result.status, 'reported-success');
      assert.deepEqual(world.agents.calls, [WRITER_ROLE, EVALUATOR_ROLE]);
      const script = await readJsonFile(stageFile(world, 'script', 'script.json'), ScriptOutputSchema);
      assert.equal(script.title, mockScript.title);
      const outcome = await readJsonFile(stageFile(world, 'script', 'review-outcome.json'), ReviewOutcomeSchema);
      assert.equal(outcome.status, 'recorded');
    });

    it('stops for the owner without calling an agent when no writer prompt is bound', async () => {
      const failure = needsPersonOf(await execute(world, 'script'));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.agents.calls, []);
    });

    it('fails as a retryable timeout when the writer times out', async () => {
      const prompt = await writerPrompt();
      world.agents.failures.set(WRITER_ROLE, { kind: 'timeout' });

      const failure = failureOf(await execute(world, 'script', { bindings: [prompt.binding], assets: [prompt.asset] }));

      assert.equal(failure.class, 'retryable');
      assert.equal(failure.class === 'retryable' ? failure.kind : null, 'timeout');
      assert.equal(await pathExists(stageFile(world, 'script', 'script.json')), false);
    });
  });

  describe('capture', () => {
    it('records a local test capture on the recipe canvas and indexes it', async () => {
      const result = await execute(world, 'capture');

      assert.equal(result.status, 'reported-success');
      const [request] = world.runner.requestsOf('test-capture');
      assert.equal(world.runner.requests.length, 1);
      assert.deepEqual({ width: request?.width, height: request?.height, durationS: request?.durationS }, { width: 1920, height: 1080, durationS: 20 });
      assert.equal(await readFile(stageFile(world, 'capture', 'capture-1.mp4'), 'utf8'), 'fake test-capture bytes');
      const index = await readJsonFile(stageFile(world, 'capture', 'captures-index.json'), CapturesIndexSchema);
      assert.equal(index.mode, 'mock');
      assert.deepEqual(
        index.captures.map((capture) => capture.path),
        [stageWorkPath(stageLocation('capture'), 'capture-1.mp4')],
      );
    });

    it('fails as a retryable tool failure when the capture tool fails', async () => {
      world.runner.failures.set('test-capture', { kind: 'tool', message: 'encoder exited' });

      const failure = failureOf(await execute(world, 'capture'));

      assert.equal(failure.class, 'retryable');
      assert.equal(failure.class === 'retryable' ? failure.kind : null, 'tool');
      assert.equal(await pathExists(stageFile(world, 'capture', 'captures-index.json')), false);
    });

    it('stops for the owner when the capture target is blocked', async () => {
      world.runner.failures.set('test-capture', { kind: 'blocked', message: 'target refused' });

      const failure = needsPersonOf(await execute(world, 'capture'));

      assert.equal(failure.cause.kind, 'needs-person');
    });

    it('indexes no capture and runs no tool when the brief has no source url', async () => {
      const result = await execute(world, 'capture', { brief: briefWithoutSource(world.run.brief) });

      assert.equal(result.status, 'reported-success');
      const index = await readJsonFile(stageFile(world, 'capture', 'captures-index.json'), CapturesIndexSchema);
      assert.deepEqual({ mode: index.mode, captures: index.captures }, { mode: 'no-source', captures: [] });
      assert.deepEqual(world.runner.requests, []);
    });
  });

  describe('scenes', () => {
    const templateRef = 'product-tour-template@1';
    const brandKitRef = 'fagmer-brand@1';

    function sceneAssets(): ResolvedAsset[] {
      const template = resolvedAsset({
        ref: templateRef,
        kind: 'template',
        contentHash: bindingHash(world, templateRef),
        absolutePath: join(world.root, 'template'),
        layout: 'folder',
        mimeType: FOLDER_MIME_TYPE,
        storage: 'reference',
      });
      const brandKit = resolvedAsset({ ref: brandKitRef, kind: 'brand-kit', contentHash: bindingHash(world, brandKitRef), absolutePath: join(world.root, 'store', 'brand-kit.json') });
      world.versions.set(templateRef, {
        ...versionBase('product-tour-template', template.contentHash),
        kind: 'template',
        layout: 'folder',
        mimeType: FOLDER_MIME_TYPE,
        storage: { mode: 'reference', absolutePath: template.absolutePath },
        details: remotionDetails(),
      });
      world.versions.set(brandKitRef, {
        ...versionBase('fagmer-brand', brandKit.contentHash),
        kind: 'brand-kit',
        details: {
          colors: [{ name: 'accent', hex: '#123abc' }],
          fonts: [],
          logoRefs: [],
          captionStyle: { fontFamily: 'Inter', fontSizePx: 48, color: '#ffffff', background: null, maxLines: 2 },
          safeZones: [],
          tagHints: [],
          toneOfVoice: '',
          motionStyle: '',
        },
      });
      return [template, brandKit];
    }

    async function scriptInput(): Promise<StageInput> {
      return writeInput(world, { name: 'script', fromStage: 'script', file: 'script.json', content: mockScript });
    }

    it('directs one scene per script scene with the template and brand kit bound', async () => {
      const assets = sceneAssets();
      const script = await scriptInput();
      const bindings = [
        { slot: 'template', ref: templateRef },
        { slot: 'brand-kit', ref: brandKitRef },
      ];

      const result = await execute(world, 'scenes', { inputs: [script], bindings, assets });

      assert.equal(result.status, 'reported-success');
      assert.deepEqual(world.agents.calls, [DIRECTOR_ROLE, EVALUATOR_ROLE]);
      const scenes = await readJsonFile(stageFile(world, 'scenes', 'scenes.json'), ScenesOutputSchema);
      assert.deepEqual(
        scenes.scenes.map((scene) => scene.sceneId),
        mockScript.scenes.map((scene) => scene.sceneId),
      );
    });

    it('stops for the owner without calling an agent when no template is bound', async () => {
      const assets = sceneAssets().filter((asset) => asset.kind !== 'template');
      const script = await scriptInput();

      const failure = needsPersonOf(await execute(world, 'scenes', { inputs: [script], bindings: [{ slot: 'brand-kit', ref: brandKitRef }], assets }));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.agents.calls, []);
    });

    it('stops for the owner when the script input is missing', async () => {
      const failure = needsPersonOf(await execute(world, 'scenes'));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.agents.calls, []);
    });
  });

  describe('narration', () => {
    async function scriptInput(): Promise<StageInput> {
      return writeInput(world, { name: 'script', fromStage: 'script', file: 'script.json', content: mockScript });
    }

    it('narrates with the mock voice, records one free tts session and assembles the audio', async () => {
      const script = await scriptInput();

      const result = await execute(world, 'narration', { inputs: [script] });

      assert.equal(result.status, 'reported-success');
      assert.deepEqual(
        world.ledger.records.map((record) => ({ kind: record.session.kind, usd: record.session.usd })),
        [{ kind: 'tts', usd: 0 }],
      );
      const [assemble] = world.runner.requestsOf('narration-assemble');
      assert.equal(assemble?.clips.length, mockScript.scenes.length);
      const index = await readJsonFile(stageFile(world, 'narration', 'narration.json'), NarrationIndexSchema);
      assert.equal(index.engine, 'mock');
      assert.equal(index.audioPath, stageWorkPath(stageLocation('narration'), 'narration.wav'));
    });

    it('stops for the owner when the script input is missing', async () => {
      const failure = needsPersonOf(await execute(world, 'narration'));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.ledger.records, []);
    });

    it('refuses a live voice provider when no voice is bound', async () => {
      world.modes.live.add('elevenlabs');
      const script = await scriptInput();

      const failure = needsPersonOf(await execute(world, 'narration', { inputs: [script] }));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.ledger.records, []);
      assert.deepEqual(world.runner.requests, []);
    });
  });

  describe('composition', () => {
    it('renders the local slate over the narration in mock mode', async () => {
      const inputs = await narrationInput(world);

      const result = await execute(world, 'composition', { inputs });

      assert.equal(result.status, 'reported-success');
      const [slate] = world.runner.requestsOf('slate-render');
      assert.deepEqual({ width: slate?.width, height: slate?.height, durationS: slate?.durationS }, { width: 1920, height: 1080, durationS: 12 });
      assert.equal(await readFile(stageFile(world, 'composition', 'composition.mp4'), 'utf8'), 'fake slate-render bytes');
    });

    it('fails as a retryable tool failure when the slate render fails', async () => {
      const inputs = await narrationInput(world);
      world.runner.failures.set('slate-render', { kind: 'tool', message: 'render exited' });

      const failure = failureOf(await execute(world, 'composition', { inputs }));

      assert.equal(failure.class, 'retryable');
      assert.equal(failure.class === 'retryable' ? failure.kind : null, 'tool');
    });

    it('stops for the owner when the narration input is missing', async () => {
      const failure = needsPersonOf(await execute(world, 'composition'));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.runner.requests, []);
    });
  });

  describe('captions', () => {
    it('writes the srt and burns it at the recipe caption height', async () => {
      const video = await videoInput(world);
      const inputs = [...(await narrationInput(world)), video];

      const result = await execute(world, 'captions', { inputs });

      assert.equal(result.status, 'reported-success');
      const [burn] = world.runner.requestsOf('caption-burn');
      assert.equal(burn?.verticalAnchor, 0.88);
      assert.equal(burn?.input, resolveInsideRun(world.runDir, video.path));
      assert.ok((await readFile(stageFile(world, 'captions', 'captions.srt'), 'utf8')).includes('-->'), 'the srt holds no cue');
      assert.equal(await pathExists(stageFile(world, 'captions', 'captions.mp4')), true);
    });

    it('stops for the owner when the narration input is missing', async () => {
      const video = await videoInput(world);

      const failure = needsPersonOf(await execute(world, 'captions', { inputs: [video] }));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.runner.requests, []);
    });

    it('fails as a retryable timeout when the caption burn times out', async () => {
      const inputs = [...(await narrationInput(world)), await videoInput(world)];
      world.runner.failures.set('caption-burn', { kind: 'timeout', message: 'burn timed out' });

      const failure = failureOf(await execute(world, 'captions', { inputs }));

      assert.equal(failure.class, 'retryable');
      assert.equal(failure.class === 'retryable' ? failure.kind : null, 'timeout');
    });
  });

  describe('fades', () => {
    it('applies the fades over the latest video', async () => {
      const video = await videoInput(world);

      const result = await execute(world, 'fades', { inputs: [video] });

      assert.equal(result.status, 'reported-success');
      assert.equal(world.runner.requestsOf('fades')[0]?.input, resolveInsideRun(world.runDir, video.path));
      assert.equal(await readFile(stageFile(world, 'fades', 'fades.mp4'), 'utf8'), 'fake fades bytes');
    });

    it('stops for the owner when there is no video input', async () => {
      const failure = needsPersonOf(await execute(world, 'fades'));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.runner.requests, []);
    });
  });

  describe('music', () => {
    const musicRef = 'spesia-music-680@1';

    it('mixes the bound music track under the latest video', async () => {
      const video = await videoInput(world);
      const track = resolvedAsset({ ref: musicRef, kind: 'music', contentHash: bindingHash(world, musicRef), absolutePath: join(world.root, 'store', 'music.mp3'), mimeType: 'audio/mpeg' });

      const result = await execute(world, 'music', { inputs: [video], bindings: [{ slot: 'music', ref: musicRef }], assets: [track] });

      assert.equal(result.status, 'reported-success');
      const [mix] = world.runner.requestsOf('music-bed');
      assert.equal(mix?.music, track.absolutePath);
      assert.equal(await readFile(stageFile(world, 'music', 'music.mp4'), 'utf8'), 'fake music-bed bytes');
    });

    it('stops for the owner without running the mixer when no music is bound', async () => {
      const video = await videoInput(world);

      const failure = needsPersonOf(await execute(world, 'music', { inputs: [video] }));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.deepEqual(world.runner.requests, []);
    });
  });

  describe('qa', () => {
    it('pins the measured video by hash and writes its metrics', async () => {
      const video = await videoInput(world, 'music');

      const result = await execute(world, 'qa', { inputs: [video] });

      assert.equal(result.status, 'reported-success');
      const subject = await readJsonFile(stageFile(world, 'qa', 'qa-subject.json'), QaSubjectSchema);
      assert.deepEqual(subject, { format: 1, path: video.path, contentHash: sha256(VIDEO_BYTES), passed: true });
      const metrics = await readJsonFile(stageFile(world, 'qa', 'metrics.json'), QaMetricsSchema);
      assert.deepEqual({ width: metrics.width, height: metrics.height, fps: metrics.fps }, { width: 1920, height: 1080, fps: 30 });
      assert.equal(await pathExists(resolveInsideRun(world.runDir, runFileNames.qaMediaReview)), true);
    });

    it('stops for the owner and records a failed subject when the video has no video stream', async () => {
      const video = await videoInput(world, 'music');
      const review = passingMediaReview();
      world.runner.results.set('media-review', { ...review, measured: { ...review.measured, video: null } });

      const failure = needsPersonOf(await execute(world, 'qa', { inputs: [video] }));

      assert.equal(failure.cause.kind, 'needs-person');
      const subject = await readJsonFile(stageFile(world, 'qa', 'qa-subject.json'), QaSubjectSchema);
      assert.equal(subject.passed, false);
      assert.equal(await pathExists(stageFile(world, 'qa', 'metrics.json')), false);
    });
  });

  describe('agent-review', () => {
    it('records the reviewer verdict on the render', async () => {
      const result = await execute(world, 'agent-review');

      assert.equal(result.status, 'reported-success');
      assert.deepEqual(world.agents.calls, [EVALUATOR_ROLE]);
      const outcome = await readJsonFile(stageFile(world, 'agent-review', 'review-outcome.json'), ReviewOutcomeSchema);
      assert.equal(outcome.status === 'recorded' ? outcome.verdict.overall : null, 4);
    });

    it('degrades to an unavailable review instead of failing when the reviewer fails', async () => {
      world.agents.failures.set(EVALUATOR_ROLE, { kind: 'provider', failure: { class: 'transient', provider: 'claude', reason: 'network' } });

      const result = await execute(world, 'agent-review');

      assert.equal(result.status, 'reported-success');
      const outcome = await readJsonFile(stageFile(world, 'agent-review', 'review-outcome.json'), ReviewOutcomeSchema);
      assert.deepEqual({ status: outcome.status, revisions: outcome.revisions }, { status: 'unavailable', revisions: 0 });
    });
  });

  describe('package', () => {
    const finalBytes = 'fake final video bytes';

    async function packageInputs(options: { passed: boolean; measuredBytes: string }): Promise<StageInput[]> {
      const video = await videoInput(world, 'music', finalBytes);
      const subject = await writeInput(world, {
        name: 'qa-subject',
        fromStage: 'qa',
        file: 'qa-subject.json',
        content: { format: 1, path: video.path, contentHash: sha256(options.measuredBytes), passed: options.passed },
      });
      const metrics = await writeInput(world, { name: 'qa-metrics', fromStage: 'qa', file: 'metrics.json', content: qaMetrics() });
      return [video, subject, metrics];
    }

    async function boundAssets(): Promise<ResolvedAsset[]> {
      const resolver = new MockAssetResolver();
      const assets: ResolvedAsset[] = [];
      for (const binding of world.run.recipe.definition.bindings) {
        const resolution = await resolver.resolve({ ref: binding.ref, expectedContentHash: binding.contentHash, signal: new AbortController().signal });
        if (resolution.status !== 'resolved') return assert.fail(`mock catalog did not resolve ${binding.ref}`);
        assets.push(resolution.asset);
      }
      return assets;
    }

    it('ships the measured video, a zero-cost file and a manifest pinning every binding', async () => {
      const inputs = await packageInputs({ passed: true, measuredBytes: finalBytes });

      const result = await execute(world, 'package', { inputs, assets: await boundAssets() });

      assert.equal(result.status, 'reported-success');
      assert.equal(await readFile(resolveInsideRun(world.runDir, runFileNames.finalVideo), 'utf8'), finalBytes);
      const manifest = await readRunManifest(world.runDir);
      if (manifest.status !== 'present') return assert.fail('package wrote no manifest.json');
      assert.deepEqual(
        manifest.value.assets.map(({ slot, ref, contentHash }) => ({ slot, ref, contentHash })),
        world.run.recipe.definition.bindings.map(({ slot, ref, contentHash }) => ({ slot, ref, contentHash })),
      );
      assert.deepEqual(
        manifest.value.outputs.map((output) => output.name),
        ['final-video', 'cost', 'qa-summary', 'report'],
      );
      const cost = await readCostFile(world.runDir);
      if (cost.status !== 'present') return assert.fail('package wrote no cost.json');
      assert.deepEqual({ sessions: cost.value.sessions, totalUsd: cost.value.totalUsd }, { sessions: [], totalUsd: 0 });
    });

    it('ships the measured video when QA did not pass (owner decision 2026-11-25: checks warn, never stop)', async () => {
      const inputs = await packageInputs({ passed: false, measuredBytes: finalBytes });

      const result = await execute(world, 'package', { inputs, assets: await boundAssets() });

      assert.equal(result.status, 'reported-success');
      assert.equal(await readFile(resolveInsideRun(world.runDir, runFileNames.finalVideo), 'utf8'), finalBytes);
    });

    it('stops for the owner when the video changed after QA measured it', async () => {
      const inputs = await packageInputs({ passed: true, measuredBytes: 'the bytes QA measured earlier' });

      const failure = needsPersonOf(await execute(world, 'package', { inputs, assets: await boundAssets() }));

      assert.equal(failure.cause.kind, 'needs-person');
      assert.equal(await pathExists(resolveInsideRun(world.runDir, runFileNames.finalVideo)), false);
    });

    it('refuses to write a manifest when a bound asset was not verified', async () => {
      const inputs = await packageInputs({ passed: true, measuredBytes: finalBytes });
      const assets = (await boundAssets()).filter((asset) => asset.kind !== 'music');

      await assert.rejects(execute(world, 'package', { inputs, assets }), (error: unknown) => {
        assert.ok(error instanceof ManifestAssetUnverifiedError);
        assert.deepEqual({ slot: error.slot, ref: error.ref }, { slot: 'music', ref: 'spesia-music-680@1' });
        return true;
      });
      assert.equal((await readRunManifest(world.runDir)).status, 'absent');
    });
  });
});
