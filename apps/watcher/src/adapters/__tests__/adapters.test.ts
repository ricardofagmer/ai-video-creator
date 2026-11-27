import 'reflect-metadata';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Logger, Module, type INestApplicationContext, type Provider } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CatalogAssetResolver } from '@studio/core/catalog';
import type { AssetResolution, AssetResolveRequest, AssetResolverPort, ResolvedAsset, StageExecutorPort } from '@studio/shared/ports';
import { appendEgressEntry, readRunFile, runDirectory, writeRunFile, writeStageInputManifest } from '@studio/shared/run-files';
import {
  formatStepKey,
  type EgressEntry,
  type JsonObject,
  type ModelUse,
  type RunFile,
  type StageEstimate,
  type StageId,
  type StageInputManifest,
  type StageLocation,
  type StepStatus,
} from '@studio/shared/run-format';
import { ActiveRun } from '../../engine/active-run';
import { type Clock } from '../../engine/clock';
import { ASSET_RESOLVER, PREFLIGHT_CHECKS } from '../../engine/engine.tokens';
import { type BoundAsset } from '../../engine/postconditions/asset-resolution';
import { emptyBaseline } from '../../engine/run-budget';
import { type PreflightCheck, type PreflightVerdict } from '../../engine/seams';
import { StageWorkspace } from '../../engine/stage-workspace';
import { MockAssetResolver } from '../../mocks/mock-asset-resolver';
import { createWatcherHome } from '../../test-support';
import { CatalogAssetResolverAdapter, catalogAssetResolverProvider } from '../catalog/catalog-asset-resolver.adapter';
import { RunManifestBuilder } from '../manifest/run-manifest.builder';
import { ManifestAssetUnverifiedError, toRunManifest, type RunManifestOutput, type RunManifestSource } from '../manifest/run-manifest.mapper';
import { BoundAssetsPreflightCheck, boundAssetsPreflightProvider } from '../preflight/bound-assets.preflight-check';

/*
 * Ticket 03 acceptance criterion 2 (CR3): each watcher adapter maps its port result and its port
 * error as documented.
 * - Catalog adapter (C6 `AssetResolverPort`, R1-06): hands core's resolution back unchanged, logs
 *   it by ref only (never by path, PRD 12) and lets a catalog failure reach the caller. Core's
 *   resolver reads SQLite, so it is replaced on its own injection token by a scripted catalog.
 * - Manifest mapper and builder (PRD 7.4, criterion 8): pin every binding with the hash preflight
 *   verified, refuse an unverified binding or reference with `ManifestAssetUnverifiedError`, and
 *   read input manifests only for stages whose `snapshot` settled.
 * - Bound-assets preflight check (seam `PREFLIGHT_CHECKS`): passes when every pin is in the
 *   engine's resolution, otherwise fails as a postcondition naming the asset by ref.
 * Run folders are working copies of the committed fixture inside a temp watcher home.
 */

const FIXTURE_DIR = resolve(__dirname, '../../../fixtures/product-tour-16x9');
const NOW = new Date('2026-11-21T12:00:00.000Z');
const OTHER_HASH = 'f'.repeat(64);
const PLAN_LOCATION: StageLocation = { stageNumber: 1, stageId: 'plan' };
const ZERO_ESTIMATE: StageEstimate = { tokens: 0, ttsChars: 0, renderSec: 0, usd: 0 };
const logLevels: readonly ('log' | 'warn' | 'error' | 'debug' | 'verbose')[] = ['log', 'warn', 'error', 'debug', 'verbose'];

/** Owner-facing pt-BR texts the preflight check documents (D16). */
const preflightTexts = {
  postcondition: 'todo ativo vinculado foi resolvido pelo motor com o hash fixado',
  notResolved: 'O motor não conferiu os ativos vinculados antes desta verificação.',
};

const clock: Clock = { now: () => NOW };

type LogLevel = (typeof logLevels)[number];

interface LoggedLine {
  level: LogLevel;
  message: unknown;
}

let logged: LoggedLine[] = [];

beforeEach(() => {
  logged = [];
  for (const level of logLevels) {
    mock.method(Logger.prototype, level, (message: unknown): void => {
      logged.push({ level, message });
    });
  }
});

afterEach(() => {
  mock.restoreAll();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function eventOf(message: unknown): string | undefined {
  if (!isRecord(message)) return undefined;
  const event = message['event'];
  return typeof event === 'string' ? event : undefined;
}

/** Structured log lines whose `event` starts with `asset.`. */
function assetLogLines(): LoggedLine[] {
  return logged.filter((line) => eventOf(line.message)?.startsWith('asset.') === true);
}

function resolvedAsset(overrides: Pick<ResolvedAsset, 'ref' | 'kind' | 'contentHash'> & Partial<ResolvedAsset>): ResolvedAsset {
  return {
    assetStatus: 'active',
    sizeBytes: 64,
    mimeType: 'application/octet-stream',
    layout: 'file',
    sensitivity: 'normal',
    license: null,
    storage: 'store',
    absolutePath: `/catalog-test/${overrides.ref.replace('@', '/')}`,
    ...overrides,
  };
}

/** Every recipe binding of `run`, resolved by the in-memory mock catalog the fixture is pinned to. */
async function verifiedBindings(run: RunFile): Promise<ResolvedAsset[]> {
  const resolver = new MockAssetResolver();
  const assets: ResolvedAsset[] = [];
  for (const binding of run.recipe.definition.bindings) {
    const resolution = await resolver.resolve({ ref: binding.ref, expectedContentHash: binding.contentHash, signal: new AbortController().signal });
    if (resolution.status !== 'resolved') return assert.fail(`the mock catalog did not resolve ${binding.ref}`);
    assets.push(resolution.asset);
  }
  return assets;
}

function pinOf(run: RunFile, slot: string): { ref: string; contentHash: string } {
  const binding = run.recipe.definition.bindings.find((candidate) => candidate.slot === slot);
  if (binding === undefined) return assert.fail(`the fixture recipe binds no ${slot}`);
  return { ref: binding.ref, contentHash: binding.contentHash };
}

function stageNumberOf(run: RunFile, stageId: StageId): number {
  const stage = run.stages.find((candidate) => candidate.stageId === stageId);
  if (stage === undefined) return assert.fail(`the fixture run has no ${stageId} stage`);
  return stage.number;
}

function inputManifest(run: RunFile, stageId: StageId, options: { parameters: JsonObject; models: ModelUse[] }): StageInputManifest {
  return {
    runId: run.runId,
    stageNumber: stageNumberOf(run, stageId),
    stageId,
    attempt: 1,
    createdAt: NOW.toISOString(),
    briefHash: 'b'.repeat(64),
    assets: [],
    inputs: [],
    parameters: options.parameters,
    models: options.models,
  };
}

function egressEntry(stageId: StageId, summary: string): EgressEntry {
  return {
    provider: 'claude',
    what: 'prompt-text',
    stepKey: formatStepKey({ stageId, step: 'execute', attempt: 1 }),
    sessionId: null,
    at: NOW.toISOString(),
    summary,
  };
}

function manifestSource(run: RunFile, assets: readonly ResolvedAsset[], overrides: Partial<RunManifestSource> = {}): RunManifestSource {
  return { run, assets, stageManifests: [], outputs: [], egress: [], createdAt: NOW, ...overrides };
}

/** The `snapshot` step of each listed stage set to the given status; every other step is unchanged. */
function withSnapshotStatuses(run: RunFile, statuses: Partial<Record<StageId, StepStatus>>): RunFile {
  return {
    ...run,
    stages: run.stages.map((stage) => {
      const status = statuses[stage.stageId];
      if (status === undefined) return stage;
      return { ...stage, steps: stage.steps.map((record) => (record.step === 'snapshot' ? { ...record, status } : record)) };
    }),
  };
}

@Module({})
class AdapterTestModule {}

async function bootProviders(providers: Provider[]): Promise<INestApplicationContext> {
  // abortOnError false: a resolution failure fails the test instead of exiting the process.
  return NestFactory.createApplicationContext({ module: AdapterTestModule, providers }, { logger: false, abortOnError: false });
}

/** Stands in for core's SQLite-backed `CatalogAssetResolver`: records each request and answers from a script. */
class ScriptedCatalog implements AssetResolverPort {
  readonly requests: AssetResolveRequest[] = [];

  constructor(private readonly answer: (request: AssetResolveRequest) => Promise<AssetResolution>) {}

  async resolve(request: AssetResolveRequest): Promise<AssetResolution> {
    this.requests.push(request);
    return this.answer(request);
  }
}

function resolveRequest(ref: string, expectedContentHash: string | null = null): AssetResolveRequest {
  return { ref, expectedContentHash, signal: new AbortController().signal };
}

class InertExecutor implements StageExecutorPort {
  readonly stageId = PLAN_LOCATION.stageId;

  async estimate(): Promise<StageEstimate> {
    return ZERO_ESTIMATE;
  }

  declaredOutputs(): [] {
    return [];
  }

  async execute(): Promise<never> {
    throw new Error('the preflight check must not run the executor');
  }

  async verify(): Promise<never> {
    throw new Error('the preflight check must not run verify');
  }
}

const inertResolver: AssetResolverPort = {
  resolve: async (): Promise<never> => {
    throw new Error('the preflight check reads the engine resolution and resolves nothing itself');
  },
};

function workspaceFor(run: RunFile, runDir: string, bound: readonly BoundAsset[] | null): StageWorkspace {
  const active = new ActiveRun({ runDir, run, pid: 4242, clock, baseline: emptyBaseline });
  const workspace = new StageWorkspace({ active, location: PLAN_LOCATION, executor: new InertExecutor(), resolver: inertResolver });
  if (bound !== null) workspace.rememberBoundAssets(bound);
  return workspace;
}

function bindingsAsBound(run: RunFile, assets: readonly ResolvedAsset[]): BoundAsset[] {
  return run.recipe.definition.bindings.flatMap((binding): BoundAsset[] => {
    const asset = assets.find((candidate) => candidate.ref === binding.ref);
    return asset === undefined ? [] : [{ slot: binding.slot, asset }];
  });
}

function failedDetail(verdict: PreflightVerdict): string {
  if (verdict.status !== 'failed' || verdict.failure.origin !== 'postcondition') return assert.fail(`expected a postcondition failure, got ${verdict.status}`);
  assert.equal(verdict.failure.postcondition, preflightTexts.postcondition);
  return verdict.failure.detail;
}

describe('watcher adapters (ticket 03 criterion 2)', () => {
  let home: { root: string; close(): Promise<void> } | undefined;
  let fixture: RunFile;
  let runDir: string;

  beforeEach(async () => {
    home = await createWatcherHome({ prefix: 'watcher-adapters' });
    fixture = await readRunFile(FIXTURE_DIR);
    runDir = runDirectory(home.root, fixture.runId);
  });

  afterEach(async () => {
    await home?.close();
    home = undefined;
  });

  describe('catalog asset resolver adapter (R1-06)', () => {
    let app: INestApplicationContext | undefined;

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    async function bootAdapter(catalog: ScriptedCatalog): Promise<AssetResolverPort> {
      app = await bootProviders([{ provide: CatalogAssetResolver, useValue: catalog }, catalogAssetResolverProvider]);
      return app.get<AssetResolverPort>(ASSET_RESOLVER);
    }

    it('binds the adapter on ASSET_RESOLVER and hands it each request unchanged', async () => {
      const answer: AssetResolution = { status: 'unknown-ref', ref: 'missing-template@9' };
      const catalog = new ScriptedCatalog(async () => answer);
      const resolver = await bootAdapter(catalog);
      const request = resolveRequest('missing-template@9', OTHER_HASH);

      await resolver.resolve(request);

      assert.ok(resolver instanceof CatalogAssetResolverAdapter, 'ASSET_RESOLVER is not the catalog adapter');
      assert.equal(catalog.requests.length, 1);
      assert.equal(catalog.requests[0], request, 'the request reached the catalog changed');
    });

    it('returns a resolved asset exactly as the catalog answered it', async () => {
      const answer: AssetResolution = {
        status: 'resolved',
        asset: resolvedAsset({ ref: 'owner-voice@2', kind: 'reference', contentHash: 'a'.repeat(64), sensitivity: 'biometric', storage: 'reference' }),
      };
      const resolver = await bootAdapter(new ScriptedCatalog(async () => answer));

      const resolution = await resolver.resolve(resolveRequest('owner-voice@2'));

      assert.equal(resolution, answer);
    });

    it('returns each unresolved outcome exactly as the catalog answered it', async () => {
      const outcomes: AssetResolution[] = [
        { status: 'unknown-ref', ref: 'no-such-asset@1' },
        { status: 'file-missing', ref: 'moved-music@3' },
        { status: 'hash-mismatch', ref: 'edited-template@2', expected: 'c'.repeat(64), actual: OTHER_HASH },
      ];
      const byRef = new Map(outcomes.map((outcome) => [outcome.status === 'resolved' ? outcome.asset.ref : outcome.ref, outcome]));
      const resolver = await bootAdapter(
        new ScriptedCatalog(async (request) => byRef.get(request.ref) ?? assert.fail(`no scripted answer for ${request.ref}`)),
      );

      for (const outcome of outcomes) {
        const ref = outcome.status === 'resolved' ? outcome.asset.ref : outcome.ref;
        assert.equal(await resolver.resolve(resolveRequest(ref)), outcome, `the ${outcome.status} outcome came back changed`);
      }
    });

    it('logs a resolved asset by ref and storage, never by its path', async () => {
      const asset = resolvedAsset({ ref: 'owner-voice@2', kind: 'reference', contentHash: 'a'.repeat(64), sensitivity: 'biometric', storage: 'reference' });
      const resolver = await bootAdapter(new ScriptedCatalog(async () => ({ status: 'resolved', asset })));

      await resolver.resolve(resolveRequest('owner-voice@2'));

      const lines = assetLogLines();
      assert.equal(lines.length, 1);
      const [line] = lines;
      if (line === undefined || !isRecord(line.message)) return assert.fail('the adapter logged no structured asset line');
      const { durationMs, ...fields } = line.message;
      assert.equal(line.level, 'debug');
      assert.deepEqual(fields, { event: 'asset.resolved', ref: 'owner-voice@2', storage: 'reference' });
      assert.equal(typeof durationMs, 'number');
      assert.ok(!JSON.stringify(logged.map((entry) => entry.message)).includes(asset.absolutePath), 'a log line carries the asset path');
    });

    it('logs an unresolved outcome as a warning naming the ref and the outcome', async () => {
      const resolver = await bootAdapter(
        new ScriptedCatalog(async () => ({ status: 'hash-mismatch', ref: 'edited-template@2', expected: 'c'.repeat(64), actual: OTHER_HASH })),
      );

      await resolver.resolve(resolveRequest('edited-template@2'));

      const lines = assetLogLines();
      assert.equal(lines.length, 1);
      const [line] = lines;
      if (line === undefined || !isRecord(line.message)) return assert.fail('the adapter logged no structured asset line');
      const { durationMs, ...fields } = line.message;
      assert.equal(line.level, 'warn');
      assert.deepEqual(fields, { event: 'asset.unresolved', ref: 'edited-template@2', outcome: 'hash-mismatch' });
      assert.equal(typeof durationMs, 'number');
    });

    it('lets a catalog failure reach the caller unchanged and logs no outcome for it', async () => {
      const failure = new Error('catalog read failed');
      const resolver = await bootAdapter(
        new ScriptedCatalog(async () => {
          throw failure;
        }),
      );

      await assert.rejects(resolver.resolve(resolveRequest('template@1')), (error: unknown) => error === failure);
      assert.deepEqual(assetLogLines(), []);
    });
  });

  describe('run manifest mapper (PRD 7.4, criterion 8)', () => {
    it('pins every recipe binding with the hash preflight verified, its kind and its sensitivity', async () => {
      const assets = await verifiedBindings(fixture);

      const manifest = toRunManifest(manifestSource(fixture, assets));

      const expected = fixture.recipe.definition.bindings.map((binding) => {
        const asset = assets.find((candidate) => candidate.ref === binding.ref) ?? assert.fail(`no verified asset for ${binding.ref}`);
        return { slot: binding.slot, ref: binding.ref, kind: asset.kind, contentHash: binding.contentHash, sensitivity: asset.sensitivity };
      });
      assert.deepEqual(manifest.assets, expected);
      assert.deepEqual(manifest.recipe, { ref: fixture.recipe.ref, contentHash: fixture.recipe.contentHash });
      assert.deepEqual({ format: manifest.format, runId: manifest.runId, createdAt: manifest.createdAt }, { format: 1, runId: fixture.runId, createdAt: NOW.toISOString() });
    });

    it('lists the run references in order with their verified hashes', async () => {
      const run: RunFile = { ...fixture, references: ['screen-reference@3', 'product-shot@1'] };
      const references = [
        resolvedAsset({ ref: 'screen-reference@3', kind: 'reference', contentHash: 'd'.repeat(64) }),
        resolvedAsset({ ref: 'product-shot@1', kind: 'image', contentHash: 'e'.repeat(64) }),
      ];

      const manifest = toRunManifest(manifestSource(run, [...(await verifiedBindings(run)), ...references]));

      assert.deepEqual(manifest.references, [
        { ref: 'screen-reference@3', contentHash: 'd'.repeat(64) },
        { ref: 'product-shot@1', contentHash: 'e'.repeat(64) },
      ]);
    });

    it('refuses a binding preflight did not verify, naming its slot and ref', async () => {
      const music = pinOf(fixture, 'music');
      const assets = (await verifiedBindings(fixture)).filter((asset) => asset.ref !== music.ref);

      assert.throws(
        () => toRunManifest(manifestSource(fixture, assets)),
        (error: unknown) =>
          error instanceof ManifestAssetUnverifiedError && error.slot === 'music' && error.ref === music.ref && error.category === 'internal',
      );
    });

    it('refuses a binding that re-hashed to another value than the recipe pins', async () => {
      const music = pinOf(fixture, 'music');
      const assets = (await verifiedBindings(fixture)).map((asset) => (asset.ref === music.ref ? { ...asset, contentHash: OTHER_HASH } : asset));

      assert.throws(
        () => toRunManifest(manifestSource(fixture, assets)),
        (error: unknown) => error instanceof ManifestAssetUnverifiedError && error.slot === 'music' && error.ref === music.ref,
      );
    });

    it('refuses an unverified run reference as slot reference:N, numbered from 1', async () => {
      const run: RunFile = { ...fixture, references: ['screen-reference@3', 'product-shot@1'] };
      const assets = [...(await verifiedBindings(run)), resolvedAsset({ ref: 'screen-reference@3', kind: 'reference', contentHash: 'd'.repeat(64) })];

      assert.throws(
        () => toRunManifest(manifestSource(run, assets)),
        (error: unknown) => error instanceof ManifestAssetUnverifiedError && error.slot === 'reference:2' && error.ref === 'product-shot@1',
      );
    });

    it('records the brief, each stage manifest parameters and each role and model pair once, in first-seen order', async () => {
      const stageManifests = [
        inputManifest(fixture, 'plan', { parameters: { durationS: 60 }, models: [{ role: 'planner', modelId: 'model-a' }] }),
        inputManifest(fixture, 'script', {
          parameters: { tone: 'direto' },
          models: [
            { role: 'writer', modelId: 'model-b' },
            { role: 'planner', modelId: 'model-a' },
            { role: 'planner', modelId: 'model-z' },
          ],
        }),
        inputManifest(fixture, 'scenes', { parameters: {}, models: [{ role: 'director', modelId: 'model-c' }, { role: 'writer', modelId: 'model-b' }] }),
      ];

      const manifest = toRunManifest(manifestSource(fixture, await verifiedBindings(fixture), { stageManifests }));

      assert.deepEqual(manifest.parameters, {
        brief: fixture.brief,
        stages: [
          { stageId: 'plan', params: { durationS: 60 } },
          { stageId: 'script', params: { tone: 'direto' } },
          { stageId: 'scenes', params: {} },
        ],
      });
      assert.deepEqual(manifest.models, [
        { role: 'planner', modelId: 'model-a' },
        { role: 'writer', modelId: 'model-b' },
        { role: 'planner', modelId: 'model-z' },
        { role: 'director', modelId: 'model-c' },
      ]);
    });

    it('lists the outputs and the egress entries it was given', async () => {
      const outputs: RunManifestOutput[] = [{ name: 'final-video', path: 'final.mp4', contentHash: 'a'.repeat(64), sizeBytes: 1024 }];
      const egress = [egressEntry('script', 'roteiro, 1.240 caracteres')];

      const manifest = toRunManifest(manifestSource(fixture, await verifiedBindings(fixture), { outputs, egress }));

      assert.deepEqual(manifest.outputs, outputs);
      assert.deepEqual(manifest.egress, egress);
    });
  });

  describe('run manifest builder (R1-14 package stage)', () => {
    it('reads the input manifest of each stage whose snapshot settled ok or warning, and of no other stage', async () => {
      const run = withSnapshotStatuses(fixture, { plan: 'ok', research: 'failed', script: 'warning' });
      await writeRunFile(runDir, run);
      await writeStageInputManifest(runDir, inputManifest(run, 'plan', { parameters: { durationS: 60 }, models: [{ role: 'planner', modelId: 'model-a' }] }));
      // Present on disk, but its snapshot failed: the stage never ran with it.
      await writeStageInputManifest(runDir, inputManifest(run, 'research', { parameters: { depth: 2 }, models: [{ role: 'researcher', modelId: 'model-r' }] }));
      await writeStageInputManifest(runDir, inputManifest(run, 'script', { parameters: { tone: 'direto' }, models: [{ role: 'writer', modelId: 'model-b' }] }));

      const manifest = await new RunManifestBuilder().build({ runDir, assets: await verifiedBindings(run), outputs: [], createdAt: NOW });

      assert.deepEqual(manifest.parameters.stages, [
        { stageId: 'plan', params: { durationS: 60 } },
        { stageId: 'script', params: { tone: 'direto' } },
      ]);
      assert.deepEqual(manifest.models, [
        { role: 'planner', modelId: 'model-a' },
        { role: 'writer', modelId: 'model-b' },
      ]);
    });

    it('copies every egress.jsonl line into the manifest, in order', async () => {
      await writeRunFile(runDir, fixture);
      const entries = [egressEntry('research', 'página de exemplo, 2.100 caracteres'), egressEntry('script', 'roteiro, 1.240 caracteres')];
      for (const entry of entries) await appendEgressEntry(runDir, entry);

      const manifest = await new RunManifestBuilder().build({ runDir, assets: await verifiedBindings(fixture), outputs: [], createdAt: NOW });

      assert.deepEqual(manifest.egress, entries);
    });

    it('lists no egress when the run recorded no external call', async () => {
      await writeRunFile(runDir, fixture);

      const manifest = await new RunManifestBuilder().build({ runDir, assets: await verifiedBindings(fixture), outputs: [], createdAt: NOW });

      assert.deepEqual(manifest.egress, []);
    });

    it('pins the bindings and passes the caller outputs through to the manifest', async () => {
      await writeRunFile(runDir, fixture);
      const outputs: RunManifestOutput[] = [{ name: 'final-video', path: 'final.mp4', contentHash: 'a'.repeat(64), sizeBytes: 1024 }];

      const manifest = await new RunManifestBuilder().build({ runDir, assets: await verifiedBindings(fixture), outputs, createdAt: NOW });

      assert.deepEqual(
        manifest.assets.map(({ slot, ref, contentHash }) => ({ slot, ref, contentHash })),
        fixture.recipe.definition.bindings.map(({ slot, ref, contentHash }) => ({ slot, ref, contentHash })),
      );
      assert.deepEqual(manifest.outputs, outputs);
    });

    it('refuses to build when a bound asset is missing from the request', async () => {
      await writeRunFile(runDir, fixture);
      const music = pinOf(fixture, 'music');
      const assets = (await verifiedBindings(fixture)).filter((asset) => asset.ref !== music.ref);

      await assert.rejects(
        new RunManifestBuilder().build({ runDir, assets, outputs: [], createdAt: NOW }),
        (error: unknown) => error instanceof ManifestAssetUnverifiedError && error.slot === 'music' && error.ref === music.ref,
      );
    });
  });

  describe('bound-assets preflight check (R1-06)', () => {
    let app: INestApplicationContext | undefined;

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    it('is the one extra check bound on PREFLIGHT_CHECKS', async () => {
      app = await bootProviders([boundAssetsPreflightProvider]);

      const checks = app.get<readonly PreflightCheck[]>(PREFLIGHT_CHECKS);

      assert.equal(checks.length, 1);
      assert.ok(checks[0] instanceof BoundAssetsPreflightCheck);
      assert.equal(checks[0]?.name, 'bound-assets-present');
    });

    it('fails as a postcondition when the engine has not resolved the bound assets yet', async () => {
      const verdict = await new BoundAssetsPreflightCheck().check(workspaceFor(fixture, runDir, null));

      assert.deepEqual(verdict, {
        status: 'failed',
        failure: { origin: 'postcondition', postcondition: preflightTexts.postcondition, detail: preflightTexts.notResolved },
      });
    });

    it('passes and counts every binding and run reference present with its pin', async () => {
      const run: RunFile = { ...fixture, references: ['screen-reference@3'] };
      const bound = [
        ...bindingsAsBound(run, await verifiedBindings(run)),
        { slot: 'reference:1', asset: resolvedAsset({ ref: 'screen-reference@3', kind: 'reference', contentHash: 'd'.repeat(64) }) },
      ];

      const verdict = await new BoundAssetsPreflightCheck().check(workspaceFor(run, runDir, bound));

      assert.deepEqual(verdict, { status: 'passed', detail: '5 ativo(s) vinculado(s) presente(s) na resolução do motor.' });
    });

    it('fails naming a binding the engine resolution does not hold', async () => {
      const music = pinOf(fixture, 'music');
      const bound = bindingsAsBound(fixture, await verifiedBindings(fixture)).filter((entry) => entry.asset.ref !== music.ref);

      const verdict = await new BoundAssetsPreflightCheck().check(workspaceFor(fixture, runDir, bound));

      assert.equal(failedDetail(verdict), `O ativo ${music.ref} não foi resolvido nesta etapa.`);
    });

    it('fails naming both hashes when a binding resolved to another hash than the recipe pins', async () => {
      const music = pinOf(fixture, 'music');
      const bound = bindingsAsBound(fixture, await verifiedBindings(fixture)).map((entry) =>
        entry.asset.ref === music.ref ? { ...entry, asset: { ...entry.asset, contentHash: OTHER_HASH } } : entry,
      );

      const verdict = await new BoundAssetsPreflightCheck().check(workspaceFor(fixture, runDir, bound));

      assert.equal(
        failedDetail(verdict),
        `O ativo ${music.ref} foi resolvido com hash ${OTHER_HASH.slice(0, 12)}, mas a receita fixa ${music.contentHash.slice(0, 12)}.`,
      );
    });

    it('fails naming a run reference the engine did not resolve', async () => {
      const run: RunFile = { ...fixture, references: ['screen-reference@3'] };
      const bound = bindingsAsBound(run, await verifiedBindings(run));

      const verdict = await new BoundAssetsPreflightCheck().check(workspaceFor(run, runDir, bound));

      assert.equal(failedDetail(verdict), 'O ativo screen-reference@3 não foi resolvido nesta etapa.');
    });

    it('names every problem asset in one failure', async () => {
      const music = pinOf(fixture, 'music');
      const template = pinOf(fixture, 'template');
      const bound = bindingsAsBound(fixture, await verifiedBindings(fixture))
        .filter((entry) => entry.asset.ref !== music.ref)
        .map((entry) => (entry.asset.ref === template.ref ? { ...entry, asset: { ...entry.asset, contentHash: OTHER_HASH } } : entry));

      const detail = failedDetail(await new BoundAssetsPreflightCheck().check(workspaceFor(fixture, runDir, bound)));

      assert.ok(detail.includes(`O ativo ${music.ref} não foi resolvido nesta etapa.`), 'the missing binding is not named');
      assert.ok(detail.includes(`O ativo ${template.ref} foi resolvido com hash ${OTHER_HASH.slice(0, 12)}`), 'the re-hashed binding is not named');
    });
  });
});
