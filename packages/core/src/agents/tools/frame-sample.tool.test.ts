import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CqrsModule, QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { FrameSampleInputSchema } from '@studio/shared/agents';
import { type AssetVersion } from '@studio/shared/catalog';
import { writeRunFile, writeRunManifest } from '@studio/shared/run-files';
import { RunFileSchema, RunManifestSchema, type RunFile } from '@studio/shared/run-format';
import { AssetVersionNotFoundError, GetAssetVersionQuery } from '../../catalog';
import { BiometricRunGuard } from '../../review/biometric-guard';
import { PromoteManifestMismatchError } from '../../review/review.errors';
import { frameSampleTool, type RunBiometricCheck } from './frame-sample.tool';
import { ToolFailure } from './tool-errors';
import { StepToolState } from './tool-state';
import { TEST_RUN_ID, musicVersion, tempRoot, testRedactor, testScope, type TempRoot } from './tool-fixtures.harness.test';

/*
 * Baseline review M2 (2026-11-21): FrameSampleTool sent frames of renders to Claude without asking
 * whether the run used biometric material. A render carries every bound asset (an avatar, a cloned
 * voice), so `source=render` now runs the review module's BiometricRunGuard first and answers
 * ERROR_SOURCE_NOT_FOUND when it trips or cannot decide. L4 at the tool level: a recorded render
 * that resolves to a non-container file is refused before any process starts.
 *
 * The guard is the real one over a real CQRS bus whose single handler answers from memory; the
 * run folder is a temp folder; ffmpeg never runs (PATH points at an empty folder, so the "clear"
 * case stops at "ffmpeg is not installed", which proves sampling was attempted).
 */

const WATCHER_RUN_FIXTURE = resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'watcher', 'fixtures', 'product-tour-16x9', 'run.json');
const BIOMETRIC_AVATAR_REF = 'avatar-clone@2';
const HASH = 'e'.repeat(64);
const RENDER_INPUT = FrameSampleInputSchema.parse({ source: 'render', timestampsMs: [500], width: 512 });

@Module({})
class FrameSampleCatalogTestModule {}

/** The catalog the handler answers from; tests replace entries before each call. */
const catalog = new Map<string, AssetVersion>();

@QueryHandler(GetAssetVersionQuery)
class InMemoryAssetVersionHandler implements IQueryHandler<GetAssetVersionQuery, AssetVersion> {
  async execute(query: GetAssetVersionQuery): Promise<AssetVersion> {
    const version = catalog.get(query.ref);
    if (version === undefined) throw new AssetVersionNotFoundError(query.ref);
    return version;
  }
}

async function fixtureRun(): Promise<RunFile> {
  const parsed: unknown = JSON.parse(await readFile(WATCHER_RUN_FIXTURE, 'utf8'));
  return RunFileSchema.parse(parsed);
}

function withComposition(run: RunFile, extraBindingRef?: string): RunFile {
  const output = { name: 'composition', path: 'composition.mp4', contentHash: HASH, sizeBytes: 16, recordedAt: '2026-11-21T10:00:00.000Z' };
  const bindings = extraBindingRef === undefined
    ? run.recipe.definition.bindings
    : [...run.recipe.definition.bindings, { slot: 'avatar', ref: extraBindingRef, contentHash: HASH }];
  return {
    ...run,
    runId: TEST_RUN_ID,
    recipe: { ...run.recipe, definition: { ...run.recipe.definition, bindings } },
    stages: run.stages.map((stage) => (stage.stageId === 'composition' ? { ...stage, outputs: [output] } : stage)),
  };
}

async function writeManifest(runDir: string, options: { runId: string; biometricRef?: string }): Promise<void> {
  const assets = [{ slot: 'music', ref: 'spesia-music-680@1', kind: 'music', contentHash: HASH, sensitivity: 'normal' }];
  if (options.biometricRef !== undefined) {
    assets.push({ slot: 'avatar', ref: options.biometricRef, kind: 'ai-model', contentHash: HASH, sensitivity: 'biometric' });
  }
  await writeRunManifest(
    runDir,
    RunManifestSchema.parse({
      format: 1,
      runId: options.runId,
      createdAt: '2026-11-21T10:00:00.000Z',
      recipe: { ref: 'product-tour-16x9@1', contentHash: HASH },
      assets,
      references: [],
      parameters: {
        brief: { topic: 'Tour do produto', keyMessages: [], format: '16:9', language: 'pt-BR', targetDurationSec: 60 },
        stages: [],
      },
      models: [],
      outputs: [],
      egress: [],
    }),
  );
}

/** Every recipe binding of the fixture as a `normal` catalog version. */
function seedNormalCatalog(run: RunFile): void {
  catalog.clear();
  for (const binding of run.recipe.definition.bindings) catalog.set(binding.ref, musicVersion(binding.ref, 'normal'));
}

/** Records the runs it was asked about and delegates to the real guard. */
class RecordingGuard implements RunBiometricCheck {
  readonly asked: string[] = [];

  constructor(private readonly inner: RunBiometricCheck) {}

  async assertNoBiometricInputs(loaded: Parameters<RunBiometricCheck['assertNoBiometricInputs']>[0]): Promise<void> {
    this.asked.push(`${loaded.runId}@${loaded.runDir}`);
    await this.inner.assertNoBiometricInputs(loaded);
  }
}

async function sampleRender(runDir: string, guard: RunBiometricCheck): Promise<unknown> {
  const tool = frameSampleTool({ redactor: testRedactor(), biometricRuns: guard });
  try {
    return await tool.run(RENDER_INPUT, { scope: testScope(runDir), state: new StepToolState(), callIndex: 1 });
  } catch (error) {
    return error;
  }
}

function assertToolFailure(outcome: unknown, code: string): void {
  assert.ok(outcome instanceof ToolFailure, `expected ${code}, got ${String(outcome)}`);
  assert.equal(outcome.code, code);
}

/** A run whose capture stage recorded `indexText` as its captures index (hash and size of these bytes). */
function withCapturesIndex(run: RunFile, indexText: string): RunFile {
  const output = {
    name: 'captures-index',
    path: 'captures-index.json',
    contentHash: createHash('sha256').update(indexText).digest('hex'),
    sizeBytes: Buffer.byteLength(indexText),
    recordedAt: '2026-11-21T10:00:00.000Z',
  };
  return { ...run, runId: TEST_RUN_ID, stages: run.stages.map((stage) => (stage.stageId === 'capture' ? { ...stage, outputs: [output] } : stage)) };
}

function capturesIndexText(sensitivity: 'normal' | 'biometric'): string {
  return `${JSON.stringify({ captures: [{ captureId: 'cap-1', path: 'capture.webm', sensitivity }] })}\n`;
}

async function sampleCapture(runDir: string): Promise<unknown> {
  const unusedGuard: RunBiometricCheck = {
    assertNoBiometricInputs: async () => {
      throw new Error('capture sampling must not depend on the render guard');
    },
  };
  const tool = frameSampleTool({ redactor: testRedactor(), biometricRuns: unusedGuard });
  const input = FrameSampleInputSchema.parse({ source: 'capture', captureId: 'cap-1', timestampsMs: [500], width: 512 });
  try {
    return await tool.run(input, { scope: testScope(runDir), state: new StepToolState(), callIndex: 1 });
  } catch (error) {
    return error;
  }
}

describe('FrameSampleTool sources (baseline M2, M3, L4)', () => {
  let app: INestApplicationContext;
  let guard: BiometricRunGuard;
  let root: TempRoot;
  let runDir: string;
  let baseRun: RunFile;
  const originalPath = process.env['PATH'];

  before(async () => {
    app = await NestFactory.createApplicationContext(
      { module: FrameSampleCatalogTestModule, imports: [CqrsModule.forRoot()], providers: [InMemoryAssetVersionHandler] },
      { logger: false, abortOnError: false },
    );
    guard = new BiometricRunGuard(app.get(QueryBus));
    baseRun = await fixtureRun();
  });

  after(async () => {
    await app.close();
  });

  beforeEach(async () => {
    root = await tempRoot('frame-sample');
    runDir = join(root.path, 'runs', TEST_RUN_ID);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'composition.mp4'), Buffer.alloc(16));
    const emptyBin = join(root.path, 'empty-bin');
    await mkdir(emptyBin);
    // ffmpeg and ffprobe resolve through this PATH; an empty folder means they are never started.
    process.env['PATH'] = emptyBin;
  });

  afterEach(async () => {
    if (originalPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = originalPath;
    await root.remove();
  });

  it('samples a render of a run with no biometric input (guard consulted, ffmpeg reached)', async () => {
    const run = withComposition(baseRun);
    seedNormalCatalog(run);
    await writeRunFile(runDir, run);
    await writeManifest(runDir, { runId: TEST_RUN_ID });
    const recording = new RecordingGuard(guard);

    const outcome = await sampleRender(runDir, recording);

    assert.deepEqual(recording.asked, [`${TEST_RUN_ID}@${runDir}`]);
    assertToolFailure(outcome, 'ERROR_FFMPEG_FAILED');
    assert.ok(outcome instanceof ToolFailure && outcome.hint?.includes('not installed'));
  });

  it('refuses a render when the manifest pins a biometric asset', async () => {
    const run = withComposition(baseRun);
    seedNormalCatalog(run);
    await writeRunFile(runDir, run);
    await writeManifest(runDir, { runId: TEST_RUN_ID, biometricRef: BIOMETRIC_AVATAR_REF });

    assertToolFailure(await sampleRender(runDir, guard), 'ERROR_SOURCE_NOT_FOUND');
  });

  it('refuses a render when a recipe binding is a biometric catalog version (no manifest yet)', async () => {
    const run = withComposition(baseRun, BIOMETRIC_AVATAR_REF);
    seedNormalCatalog(run);
    catalog.set(BIOMETRIC_AVATAR_REF, musicVersion(BIOMETRIC_AVATAR_REF, 'biometric'));
    await writeRunFile(runDir, run);

    assertToolFailure(await sampleRender(runDir, guard), 'ERROR_SOURCE_NOT_FOUND');
  });

  it('fails closed when a binding has no catalog version (sensitivity unknown)', async () => {
    const run = withComposition(baseRun, 'unknown-avatar@1');
    seedNormalCatalog(run);
    catalog.delete('unknown-avatar@1');
    await writeRunFile(runDir, run);

    assertToolFailure(await sampleRender(runDir, guard), 'ERROR_SOURCE_NOT_FOUND');
  });

  it('fails closed when the manifest names another run (the guard would skip it)', async () => {
    const run = withComposition(baseRun);
    seedNormalCatalog(run);
    await writeRunFile(runDir, run);
    await writeManifest(runDir, { runId: '01JD2Q7F3M8V5K9X4T6R2N0B1E', biometricRef: BIOMETRIC_AVATAR_REF });

    assertToolFailure(await sampleRender(runDir, guard), 'ERROR_SOURCE_NOT_FOUND');
  });

  it('BiometricRunGuard itself refuses a manifest that names another run (promotion path)', async () => {
    const run = withComposition(baseRun);
    seedNormalCatalog(run);
    await writeRunFile(runDir, run);
    await writeManifest(runDir, { runId: '01JD2Q7F3M8V5K9X4T6R2N0B1E' });

    await assert.rejects(
      guard.assertNoBiometricInputs({ runId: run.runId, runDir, run }),
      (error: unknown) => error instanceof PromoteManifestMismatchError,
    );
  });

  it('fails closed when the guard itself errors', async () => {
    const run = withComposition(baseRun);
    await writeRunFile(runDir, run);
    const broken: RunBiometricCheck = {
      assertNoBiometricInputs: async () => {
        throw new Error('catalog unavailable');
      },
    };

    assertToolFailure(await sampleRender(runDir, broken), 'ERROR_SOURCE_NOT_FOUND');
  });

  it('refuses a recorded render that resolves to a playlist (no pinned demuxer)', async () => {
    const run = withComposition(baseRun);
    seedNormalCatalog(run);
    await writeRunFile(runDir, run);
    await writeManifest(runDir, { runId: TEST_RUN_ID });
    await writeFile(join(runDir, 'playlist.m3u8'), '#EXTM3U\n#EXTINF:1,\nfile:/etc/hosts\n');
    await writeFile(join(runDir, 'composition.mp4'), '');
    await import('node:fs/promises').then(({ rm }) => rm(join(runDir, 'composition.mp4')));
    await symlink(join(runDir, 'playlist.m3u8'), join(runDir, 'composition.mp4'));

    assertToolFailure(await sampleRender(runDir, guard), 'ERROR_SOURCE_NOT_FOUND');
  });

  it('samples a capture whose captures index still has its recorded hash', async () => {
    const indexText = capturesIndexText('normal');
    await writeRunFile(runDir, withCapturesIndex(baseRun, indexText));
    await writeFile(join(runDir, 'captures-index.json'), indexText);
    await writeFile(join(runDir, 'capture.webm'), Buffer.alloc(16));

    assertToolFailure(await sampleCapture(runDir), 'ERROR_FFMPEG_FAILED');
  });

  it('refuses a capture when the captures index was rewritten after record (biometric flag dropped)', async () => {
    await writeRunFile(runDir, withCapturesIndex(baseRun, capturesIndexText('biometric')));
    await writeFile(join(runDir, 'captures-index.json'), capturesIndexText('normal'));
    await writeFile(join(runDir, 'capture.webm'), Buffer.alloc(16));

    assertToolFailure(await sampleCapture(runDir), 'ERROR_SOURCE_NOT_FOUND');
  });
});
