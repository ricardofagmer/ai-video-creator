import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runDirectory, writeApprovalFile, writeRunFile, writeRunManifest } from '@studio/shared/run-files';
import { RunFileSchema, RunManifestSchema, type RunManifest } from '@studio/shared/run-format';
import { type PrismaService } from '../prisma/prisma.service';
import { type PlatformHarness } from './platform-harness.harness.test';

/*
 * Test-only run fixtures for the publish path (SPEC 0007 section 5.4): an approved run folder with
 * `run.json`, `approval.json`, `manifest.json` and a small `final.mp4`, its index and outcome rows,
 * and the catalog rows its refs point at. The `run.json` body is the watcher's offline fixture,
 * read only, with its id and state replaced. No real account, token or media is used. Helpers
 * only: the `.harness.test.ts` name keeps the file out of the build; it declares no test.
 */

const WATCHER_RUN_FIXTURE = resolve(__dirname, '..', '..', '..', '..', 'apps', 'watcher', 'fixtures', 'product-tour-16x9', 'run.json');

/** The asset refs the fixture recipe binds, all `normal`. */
const BOUND_ASSETS: readonly { ref: string; kind: string; slot: string }[] = [
  { ref: 'product-tour-template@1', kind: 'template', slot: 'template' },
  { ref: 'fagmer-brand@1', kind: 'brand-kit', slot: 'brand-kit' },
  { ref: 'writer-prompt@1', kind: 'prompt', slot: 'prompt' },
  { ref: 'spesia-music-680@1', kind: 'music', slot: 'music' },
];

/** A test-only biometric asset version: a narrator voice model, kept by reference. */
export const BIOMETRIC_REF = 'voz-narrador@3';
const HASH = 'e'.repeat(64);

export interface SeededRun {
  runId: string;
  runDir: string;
  finalSha256: string;
  finalBytes: number;
  biometricRefs: string[];
}

function parseRef(ref: string): { assetId: string; version: number } {
  const [assetId = '', version = '0'] = ref.split('@');
  return { assetId, version: Number.parseInt(version, 10) };
}

/** One draft asset version; returns its row id. */
export async function seedAssetVersion(
  prisma: PrismaService,
  options: { ref: string; kind: string; sensitivity: 'normal' | 'biometric' },
): Promise<number> {
  const { assetId, version } = parseRef(options.ref);
  await prisma.asset.upsert({ where: { id: assetId }, create: { id: assetId, kind: options.kind }, update: {} });
  const byReference = options.sensitivity === 'biometric';
  const row = await prisma.assetVersion.create({
    data: {
      assetId,
      version,
      name: `Fixture ${assetId}`,
      owner: 'owner',
      contentHash: HASH,
      sizeBytes: BigInt(1),
      mimeType: 'application/octet-stream',
      layout: 'file',
      storageMode: byReference ? 'reference' : 'store',
      referencePath: byReference ? '/fixture-reference/not-a-real-file' : null,
      sensitivity: options.sensitivity,
      detailsJson: '{}',
    },
  });
  return row.id;
}

/** The fixture catalog: the four bound refs and the biometric voice. Returns ids by ref. */
export async function seedFixtureCatalog(prisma: PrismaService): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const asset of BOUND_ASSETS) ids.set(asset.ref, await seedAssetVersion(prisma, { ...asset, sensitivity: 'normal' }));
  ids.set(BIOMETRIC_REF, await seedAssetVersion(prisma, { ref: BIOMETRIC_REF, kind: 'ai-model', sensitivity: 'biometric' }));
  return ids;
}

async function watcherRunFixture(): Promise<ReturnType<typeof RunFileSchema.parse>> {
  const parsed: unknown = JSON.parse(await readFile(WATCHER_RUN_FIXTURE, 'utf8'));
  return RunFileSchema.parse(parsed);
}

function manifestOf(options: { runId: string; finalSha256: string; finalBytes: number; withBiometric: boolean; createdAt: string }): RunManifest {
  const assets = BOUND_ASSETS.map((asset) => ({ slot: asset.slot, ref: asset.ref, kind: asset.kind, contentHash: HASH, sensitivity: 'normal' }));
  if (options.withBiometric) assets.push({ slot: 'voice', ref: BIOMETRIC_REF, kind: 'ai-model', contentHash: HASH, sensitivity: 'biometric' });
  return RunManifestSchema.parse({
    format: 1,
    runId: options.runId,
    createdAt: options.createdAt,
    recipe: { ref: 'product-tour-16x9@1', contentHash: HASH },
    assets,
    references: [],
    parameters: {
      brief: { topic: 'Tour do produto', keyMessages: [], format: '16:9', language: 'pt-BR', targetDurationSec: 60 },
      stages: [],
    },
    models: [],
    outputs: [{ name: 'final', path: 'final.mp4', contentHash: options.finalSha256, sizeBytes: options.finalBytes }],
    egress: [],
  });
}

/**
 * An approved (or rejected) run: folder, index row and outcome row. The SQLite outcome and the
 * run files agree unless `outcomeDecision` says otherwise, so a test can forge a mismatch.
 */
export async function seedRun(
  harness: PlatformHarness,
  options: { runId: string; approved?: boolean; withBiometric?: boolean; outcomeDecision?: 'approved' | 'rejected' },
): Promise<SeededRun> {
  const approved = options.approved ?? true;
  const withBiometric = options.withBiometric ?? true;
  const decidedAt = new Date(harness.clock.now().getTime() - 3_600_000).toISOString();
  const runDir = runDirectory(harness.dataHome.runs, options.runId);
  await mkdir(runDir, { recursive: true });

  const finalVideo = Buffer.from(`fixture final video for ${options.runId}\n`.repeat(64), 'utf8');
  await writeFile(join(runDir, 'final.mp4'), finalVideo);
  const finalSha256 = createHash('sha256').update(finalVideo).digest('hex');

  const fixture = await watcherRunFixture();
  await writeRunFile(runDir, {
    ...fixture,
    runId: options.runId,
    state: approved ? { status: 'approved', since: decidedAt, decidedBy: 'owner' } : { status: 'review', since: decidedAt },
  });
  await writeApprovalFile(runDir, {
    runId: options.runId,
    decisions: approved
      ? [{ kind: 'final', outcome: 'approved', decidedBy: 'owner', decidedAt, notes: '', correlationId: null, rating: 5, checklist: [] }]
      : [],
  });
  await writeRunManifest(
    runDir,
    manifestOf({ runId: options.runId, finalSha256, finalBytes: finalVideo.length, withBiometric, createdAt: decidedAt }),
  );

  await harness.prisma.runIndexEntry.create({
    data: {
      id: options.runId,
      title: 'Fixture run',
      status: approved ? 'approved' : 'review',
      statusSince: new Date(decidedAt),
      createdBy: 'cli',
      recipeId: 'product-tour-16x9',
      recipeVersion: 1,
      recipeContentHash: HASH,
      totalsJson: '{}',
      createdAt: new Date(decidedAt),
      updatedAt: new Date(decidedAt),
    },
  });
  const decision = options.outcomeDecision ?? (approved ? 'approved' : null);
  if (decision !== null) {
    await harness.prisma.runOutcome.create({
      data: { runId: options.runId, decision, decidedBy: 'owner', decidedAt: new Date(decidedAt), rating: 4 },
    });
  }
  return { runId: options.runId, runDir, finalSha256, finalBytes: finalVideo.length, biometricRefs: withBiometric ? [BIOMETRIC_REF] : [] };
}
