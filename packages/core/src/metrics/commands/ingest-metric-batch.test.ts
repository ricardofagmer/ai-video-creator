import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type PlatformMetrics } from '@studio/shared/metrics';
import { type MetricBatchFile } from '@studio/shared/platforms';
import { createMetricBatch, listMetricBatchIds, writePublishState } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { mockYoutubeVideoId } from '../../platforms/clients/mock/mock-data';
import { SyncPublishAttemptsCommand } from '../../platforms/commands/platform.commands';
import { buildPlatformGraph } from '../../platforms/platform-graph.harness.test';
import { createPlatformHarness, type PlatformHarness } from '../../platforms/platform-harness.harness.test';
import { connectMock, openAllGates, publishBody, requestCommand } from '../../platforms/publish-scenario.harness.test';
import { seedFixtureCatalog, seedRun } from '../../platforms/run-fixture.harness.test';
import { QualityScoreService } from '../../quality';
import { QualityScoreRepository } from '../../quality/quality-score.repository';
import { MetricImportRepository } from '../metric-import.repository';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { RunPublicationRepository } from '../run-publication.repository';
import { IngestMetricBatchCommand } from './ingest-metric-batch.command';
import { IngestMetricBatchHandler } from './ingest-metric-batch.handler';

/*
 * IngestMetricBatch (SPEC 0007 section 5.6, AC 55): a pulled batch is ingested as one transaction
 * with a `metric_imports` row of origin `api`; the same batch ingested twice writes one row; the
 * inbox file is deleted only after the commit, so a failed transaction leaves it for the next pass.
 * A row lands only on an existing publication of the batch's mode (B6, AC 59).
 */

const START = new Date('2026-11-20T10:00:00.000Z');
// A past day: the handler refuses a batch dated after the real local today.
const AS_OF_DATE = '2026-11-01';

/** Simulates a commit that fails: the import row insert throws inside the transaction. */
class FailingMetricImportRepository extends MetricImportRepository {
  override async insert(): Promise<void> {
    throw new Error('simulated metric_imports insert failure');
  }
}

let harness: PlatformHarness;
let publicationId: string;

function metrics(views: number): PlatformMetrics {
  return {
    views,
    likes: 12,
    comments: 3,
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

function batchFile(batchId: string): MetricBatchFile {
  return {
    format: 1,
    batchId,
    platform: 'youtube',
    mode: 'mock',
    asOfDate: AS_OF_DATE,
    pulledAt: START.toISOString(),
    rows: [{ publicationId, metrics: metrics(500) }],
  };
}

function handlerWith(imports: MetricImportRepository): IngestMetricBatchHandler {
  const { prisma } = harness;
  return new IngestMetricBatchHandler(
    harness.platformRoot,
    prisma,
    new RunPublicationRepository(prisma),
    new MetricSnapshotRepository(prisma),
    imports,
    new QualityScoreService(prisma, new QualityScoreRepository(prisma)),
  );
}

/** A mock publication linked through the real publish path, so the batch has a row to match. */
async function seedMockPublication(): Promise<string> {
  const graph = buildPlatformGraph(harness);
  await openAllGates(harness);
  await seedFixtureCatalog(harness.prisma);
  const run = await seedRun(harness, { runId: newUlid(START.getTime()) });
  await connectMock(graph, 'youtube');
  const created = await graph.requestPublish.execute(requestCommand({ run, platform: 'youtube', body: publishBody(run) }));
  const { attemptId } = created.attempt;
  await writePublishState(harness.platformRoot, {
    format: 1,
    attemptId,
    state: 'published',
    since: START.toISOString(),
    bytesSent: run.finalBytes,
    bytesTotal: run.finalBytes,
    reasonId: null,
    platformVideoId: mockYoutubeVideoId(attemptId),
    platformMediaId: null,
    publishedAt: START.toISOString(),
    followUntil: null,
  });
  await graph.syncAttempts.execute(new SyncPublishAttemptsCommand(run.runId));
  const publication = await harness.prisma.runPublication.findFirstOrThrow({ where: { attemptId } });
  return publication.id;
}

/** A pasted (`manual`) publication on the same run, so the batch names a row that exists. */
async function seedManualPublication(): Promise<string> {
  const mock = await harness.prisma.runPublication.findUniqueOrThrow({ where: { id: publicationId } });
  const manualId = newUlid(START.getTime());
  await harness.prisma.runPublication.create({
    data: {
      id: manualId,
      runId: mock.runId,
      platform: 'youtube',
      platformVideoId: 'MaNuAlViD01',
      url: 'https://www.youtube.com/watch?v=MaNuAlViD01',
      recordedBy: 'owner',
      recordedAt: START,
      origin: 'manual',
      attemptId: null,
    },
  });
  return manualId;
}

describe('IngestMetricBatch (AC 55)', () => {
  beforeEach(async () => {
    harness = await createPlatformHarness({ prefix: 'studio-core-ingest-batch', start: START });
    publicationId = await seedMockPublication();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('ingests a batch as one metric_imports row of origin api, writes its csv snapshot and deletes the file', async () => {
    const batchId = newUlid(START.getTime());
    await createMetricBatch(harness.platformRoot, batchFile(batchId));

    const summary = await handlerWith(new MetricImportRepository(harness.prisma)).execute(new IngestMetricBatchCommand({ batchId, correlationId: null }));

    assert.equal(summary.ingested, 1);
    const imports = await harness.prisma.metricImport.findMany();
    assert.equal(imports.length, 1);
    assert.equal(imports[0]?.origin, 'api');
    assert.equal(imports[0]?.importedBy, 'watcher');
    const snapshots = await harness.prisma.platformMetricSnapshot.findMany({ where: { publicationId } });
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.source, 'csv');
    assert.equal(snapshots[0]?.importId, imports[0]?.id);
    assert.deepEqual(await listMetricBatchIds(harness.platformRoot), []);
  });

  it('writes one metric_imports row when the same batch arrives twice', async () => {
    const batchId = newUlid(START.getTime());
    const handler = handlerWith(new MetricImportRepository(harness.prisma));
    await createMetricBatch(harness.platformRoot, batchFile(batchId));
    await handler.execute(new IngestMetricBatchCommand({ batchId, correlationId: null }));
    await createMetricBatch(harness.platformRoot, batchFile(batchId));

    const second = await handler.execute(new IngestMetricBatchCommand({ batchId, correlationId: null }));

    assert.equal(second.ingested, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(await harness.prisma.metricImport.count(), 1);
    assert.equal(await harness.prisma.platformMetricSnapshot.count({ where: { publicationId } }), 1);
    assert.deepEqual(await listMetricBatchIds(harness.platformRoot), [], 'the duplicate file is deleted');
  });

  it('leaves the file in place and writes nothing when the transaction fails', async () => {
    const batchId = newUlid(START.getTime());
    await createMetricBatch(harness.platformRoot, batchFile(batchId));

    await assert.rejects(handlerWith(new FailingMetricImportRepository(harness.prisma)).execute(new IngestMetricBatchCommand({ batchId, correlationId: null })));

    assert.deepEqual(await listMetricBatchIds(harness.platformRoot), [batchId]);
    assert.equal(await harness.prisma.metricImport.count(), 0);
    assert.equal(await harness.prisma.platformMetricSnapshot.count({ where: { publicationId } }), 0);
  });

  it('counts a row whose existing publication is not a mock publication as unmatched for a mock batch (AC 59)', async () => {
    const manualPublicationId = await seedManualPublication();
    const batchId = newUlid(START.getTime());
    await createMetricBatch(harness.platformRoot, { ...batchFile(batchId), rows: [{ publicationId: manualPublicationId, metrics: metrics(500) }] });

    await handlerWith(new MetricImportRepository(harness.prisma)).execute(new IngestMetricBatchCommand({ batchId, correlationId: null }));

    const [record] = await harness.prisma.metricImport.findMany();
    assert.ok(record);
    assert.equal(record.matched, 0);
    assert.equal(record.unmatched, 1);
    assert.equal(await harness.prisma.platformMetricSnapshot.count(), 0, 'a simulated number never lands on a real publication');
  });

  it('counts a mock publication as unmatched for a live batch, and matches the manual one (AC 59)', async () => {
    const manualPublicationId = await seedManualPublication();
    const batchId = newUlid(START.getTime());
    await createMetricBatch(harness.platformRoot, {
      ...batchFile(batchId),
      mode: 'live',
      rows: [
        { publicationId, metrics: metrics(500) },
        { publicationId: manualPublicationId, metrics: metrics(700) },
      ],
    });

    await handlerWith(new MetricImportRepository(harness.prisma)).execute(new IngestMetricBatchCommand({ batchId, correlationId: null }));

    const [record] = await harness.prisma.metricImport.findMany();
    assert.ok(record);
    assert.equal(record.matched, 1);
    assert.equal(record.unmatched, 1);
    assert.equal(await harness.prisma.platformMetricSnapshot.count({ where: { publicationId } }), 0, 'a live number never lands on a mock publication');
    assert.equal(await harness.prisma.platformMetricSnapshot.count({ where: { publicationId: manualPublicationId } }), 1);
  });
});
