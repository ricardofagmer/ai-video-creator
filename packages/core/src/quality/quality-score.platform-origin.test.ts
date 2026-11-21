import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { QUALITY_SCORE_FORMULA_VERSION } from '@studio/shared/catalog';
import { type PlatformMetrics } from '@studio/shared/metrics';
import { type PublicationOrigin } from '@studio/shared/platforms';
import { createMetricBatch } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { IngestMetricBatchCommand } from '../metrics/commands/ingest-metric-batch.command';
import { IngestMetricBatchHandler } from '../metrics/commands/ingest-metric-batch.handler';
import { MetricImportRepository } from '../metrics/metric-import.repository';
import { MetricSnapshotRepository } from '../metrics/metric-snapshot.repository';
import { RunPublicationRepository } from '../metrics/run-publication.repository';
import { createPlatformHarness, type PlatformHarness } from '../platforms/platform-harness.harness.test';
import { seedFixtureCatalog, seedRun } from '../platforms/run-fixture.harness.test';
import { QualityScoreRepository } from './quality-score.repository';
import { QualityScoreService } from './quality-score.service';

/*
 * Quality score and publication origin (SPEC 0007 B6, AC 54, AC 59): snapshots of `mock`
 * publications never reach a baseline or a run signal, so adding them leaves every score exactly
 * as it was, while the same numbers on `studio` publications move it. A batch pulled and ingested
 * through `IngestMetricBatch` (its `csv` snapshots) and a form snapshot with equal numbers give the
 * same score. Formula version 2 is the one in force.
 */

const START = new Date('2026-11-20T10:00:00.000Z');
const HASH = 'e'.repeat(64);
const RUN_COUNT = 6;
const VERSION_A = 'writer-prompt@1';
const VERSION_B = 'spesia-music-680@1';
// A past day: the ingest handler refuses a batch dated after the real local today.
const AS_OF_DATE = '2026-11-10';

let harness: PlatformHarness;

interface ScoredCatalog {
  versionIds: Map<string, number>;
  runIds: string[];
}

/** Video ids unique per prefix and run, 11 characters like a YouTube id. */
function videoId(prefix: string, index: number): string {
  return `${prefix}${index}`.padEnd(11, '0');
}

function likesOf(views: number): number {
  return Math.floor(views / 20);
}

/** One publication and, unless `source` is null, its snapshot written straight to SQLite. */
async function addPublication(
  target: PlatformHarness,
  options: { runId: string; origin: PublicationOrigin; videoId: string; views: number; source: 'form' | null },
): Promise<string> {
  const publicationId = newUlid(START.getTime());
  await target.prisma.runPublication.create({
    data: {
      id: publicationId,
      runId: options.runId,
      platform: 'youtube',
      platformVideoId: options.videoId,
      url: `https://www.youtube.com/watch?v=${options.videoId}`,
      recordedBy: 'owner',
      recordedAt: START,
      origin: options.origin,
      attemptId: options.origin === 'manual' ? null : newUlid(START.getTime()),
    },
  });
  if (options.source !== null) {
    await target.prisma.platformMetricSnapshot.create({
      data: {
        publicationId,
        asOfDate: AS_OF_DATE,
        source: options.source,
        importId: null,
        views: BigInt(options.views),
        likes: BigInt(likesOf(options.views)),
        recordedAt: START,
      },
    });
  }
  return publicationId;
}

/** The numbers a form snapshot holds: views and likes, every other metric empty. */
function pulledMetrics(views: number): PlatformMetrics {
  return {
    views,
    likes: likesOf(views),
    comments: null,
    shares: null,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
  };
}

/** A live batch pulled for `rows`, ingested through the real `IngestMetricBatch` handler. */
async function ingestPulledBatch(target: PlatformHarness, rows: readonly { publicationId: string; views: number }[]): Promise<void> {
  const { prisma } = target;
  const batchId = newUlid(START.getTime());
  await createMetricBatch(target.platformRoot, {
    format: 1,
    batchId,
    platform: 'youtube',
    mode: 'live',
    asOfDate: AS_OF_DATE,
    pulledAt: START.toISOString(),
    rows: rows.map((row) => ({ publicationId: row.publicationId, metrics: pulledMetrics(row.views) })),
  });
  const handler = new IngestMetricBatchHandler(
    target.platformRoot,
    prisma,
    new RunPublicationRepository(prisma),
    new MetricSnapshotRepository(prisma),
    new MetricImportRepository(prisma),
    new QualityScoreService(prisma, new QualityScoreRepository(prisma)),
  );
  const summary = await handler.execute(new IngestMetricBatchCommand({ batchId, correlationId: null }));
  assert.equal(summary.ingested, 1, 'the batch was ingested');
}

/**
 * Six approved runs: version A used by runs 0 to 2, version B by runs 3 to 5. Each run has one
 * manual YouTube publication with a snapshot of at least 100 views, so the platform has a baseline
 * and every run a signal: a form snapshot, or (`batch`) a pulled batch ingested by the handler.
 */
async function seedScoredCatalog(target: PlatformHarness, source: 'form' | 'batch' = 'form'): Promise<ScoredCatalog> {
  const versionIds = await seedFixtureCatalog(target.prisma);
  const runIds: string[] = [];
  const pulled: { publicationId: string; views: number }[] = [];
  for (let index = 0; index < RUN_COUNT; index += 1) {
    const run = await seedRun(target, { runId: newUlid(START.getTime() + index), withBiometric: false });
    runIds.push(run.runId);
    const assetVersionId = versionIds.get(index < 3 ? VERSION_A : VERSION_B);
    assert.ok(assetVersionId !== undefined);
    await target.prisma.runOutcomeAsset.create({ data: { runId: run.runId, assetVersionId, contentHash: HASH } });
    const views = index < 3 ? 5_000 : 150;
    const publicationId = await addPublication(target, {
      runId: run.runId,
      origin: 'manual',
      videoId: videoId('M', index),
      views,
      source: source === 'form' ? 'form' : null,
    });
    pulled.push({ publicationId, views });
  }
  if (source === 'batch') await ingestPulledBatch(target, pulled);
  return { versionIds, runIds };
}

/** Rescores the catalog and returns each version's score by ref. */
async function scoresByRef(target: PlatformHarness, versionIds: Map<string, number>): Promise<Map<string, number | null>> {
  await new QualityScoreService(target.prisma, new QualityScoreRepository(target.prisma)).rescore();
  const scores = new Map<string, number | null>();
  for (const [ref, id] of versionIds) {
    const row = await target.prisma.assetVersion.findUniqueOrThrow({ where: { id }, select: { qualityScore: true } });
    scores.set(ref, row.qualityScore);
  }
  return scores;
}

/** Second publications whose views invert the manual ranking. */
async function addInvertingPublications(catalog: ScoredCatalog, origin: PublicationOrigin): Promise<void> {
  for (const [index, runId] of catalog.runIds.entries()) {
    await addPublication(harness, { runId, origin, videoId: videoId('S', index), views: index < 3 ? 100 : 500_000, source: 'form' });
  }
}

describe('quality score and publication origin', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-quality-origin', start: START });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('uses formula version 2', () => {
    assert.equal(QUALITY_SCORE_FORMULA_VERSION, 2);
  });

  it('leaves every score unchanged when mock publications and their snapshots are added (AC 59)', async () => {
    const catalog = await seedScoredCatalog(harness);
    const before = await scoresByRef(harness, catalog.versionIds);
    assert.notEqual(before.get(VERSION_A), null, 'version A is scored');

    await addInvertingPublications(catalog, 'mock');

    assert.deepEqual(await scoresByRef(harness, catalog.versionIds), before);
  });

  it('moves the scores when the same numbers belong to studio publications', async () => {
    const catalog = await seedScoredCatalog(harness);
    const before = await scoresByRef(harness, catalog.versionIds);

    await addInvertingPublications(catalog, 'mock');
    await harness.prisma.runPublication.updateMany({ where: { origin: 'mock' }, data: { origin: 'studio' } });
    const after = await scoresByRef(harness, catalog.versionIds);

    assert.notDeepEqual(after, before);
  });
});

describe('a pulled batch scores like a form snapshot (AC 54)', () => {
  let batchHarness: PlatformHarness | null = null;

  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-quality-form', start: START });
    batchHarness = await createPlatformHarness({ prefix: 'studio-core-quality-batch', start: START });
  });

  afterEach(async () => {
    await harness.close();
    await batchHarness?.close();
  });

  it('gives the same version scores, within 0.001, for a batch ingested by IngestMetricBatch and form snapshots with equal numbers', async () => {
    assert.ok(batchHarness);
    const formCatalog = await seedScoredCatalog(harness, 'form');
    const batchCatalog = await seedScoredCatalog(batchHarness, 'batch');
    const ingested = await batchHarness.prisma.platformMetricSnapshot.findMany({ select: { source: true, importId: true } });
    assert.equal(ingested.length, RUN_COUNT);
    assert.ok(ingested.every((snapshot) => snapshot.source === 'csv' && snapshot.importId !== null), 'csv snapshots written by the handler');
    const [importRow] = await batchHarness.prisma.metricImport.findMany();
    assert.equal(importRow?.origin, 'api');

    const formScores = await scoresByRef(harness, formCatalog.versionIds);
    const batchScores = await scoresByRef(batchHarness, batchCatalog.versionIds);

    assert.notEqual(formScores.get(VERSION_A) ?? null, null, 'version A is scored');
    for (const [ref, formScore] of formScores) {
      const batchScore = batchScores.get(ref) ?? null;
      if (formScore === null || batchScore === null) {
        assert.equal(batchScore, formScore, ref);
        continue;
      }
      assert.ok(Math.abs(formScore - batchScore) < 0.001, `${ref}: ${formScore} vs ${batchScore}`);
    }
  });
});
