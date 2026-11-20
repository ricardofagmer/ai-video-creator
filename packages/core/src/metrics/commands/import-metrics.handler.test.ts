import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { type MetricSnapshot, type Publication } from '@studio/shared/metrics';
import { type MetricsRecomputeContext, type QualityScoreService } from '../../quality';
import { type NewMetricImport } from '../metric-import.repository';
import {
  type CsvSnapshotWrite,
  type ImportedFileKey,
  type MetricImportReads,
  type MetricImportStore,
  type MetricImportWrites,
} from '../metric-import.store';
import { type ImportMetricsInput } from '../metrics.input';
import { ImportMetricsCommand } from './import-metrics.command';
import { ImportMetricsHandler } from './import-metrics.handler';

/*
 * `ImportMetricsHandler` writes (SPEC 0006 section 5.3 "apply" and "Idempotency", R3-AC-08): a dry
 * run writes nothing at all; the same file imported twice for the same `asOfDate` reports
 * `created 0, updated 0`, writes no snapshot and no second `metric_imports` row; a repeated file
 * that now matches a newly recorded publication still gets its row. `InMemoryMetricImportStore`
 * stands in for `run_publications`, `platform_metric_snapshots` and `metric_imports`; the quality
 * pass is a recording fake. No Prisma, no SQLite, no network.
 */

const AS_OF_DATE = '2026-01-15';

function publication(publicationId: string, platformVideoId: string): Publication {
  return {
    publicationId,
    runId: '01JDA00000000000000000RN01',
    platform: 'youtube',
    platformVideoId,
    url: `https://www.youtube.com/watch?v=${platformVideoId}`,
    publishedOn: null,
    recordedBy: 'owner',
    recordedAt: '2026-01-10T00:00:00.000Z',
  };
}

/** The three tables an import touches, held in memory; counts every call that would write. */
class InMemoryMetricImportStore implements MetricImportStore {
  readonly publications: Publication[] = [];
  readonly importRows: NewMetricImport[] = [];
  private readonly snapshots = new Map<string, MetricSnapshot>();
  snapshotWrites = 0;
  transactions = 0;

  private static keyOf(publicationId: string, asOfDate: string): string {
    return `${publicationId}|${asOfDate}|csv`;
  }

  snapshotCount(): number {
    return this.snapshots.size;
  }

  read<Result>(work: (reads: MetricImportReads) => Promise<Result>): Promise<Result> {
    return work(this.reads());
  }

  transaction<Result>(work: (writes: MetricImportWrites) => Promise<Result>): Promise<Result> {
    this.transactions += 1;
    return work({ ...this.reads(), insertImport: (record) => this.insertImport(record), upsertCsvSnapshot: (write) => this.upsert(write) });
  }

  private reads(): MetricImportReads {
    return {
      findPublications: async (platform, platformVideoIds) =>
        this.publications.filter((stored) => stored.platform === platform && platformVideoIds.includes(stored.platformVideoId)),
      findCsvSnapshots: async (publicationIds, asOfDate) =>
        publicationIds
          .map((publicationId) => this.snapshots.get(InMemoryMetricImportStore.keyOf(publicationId, asOfDate)))
          .filter((snapshot): snapshot is MetricSnapshot => snapshot !== undefined),
      hasSameFile: async (file: ImportedFileKey) =>
        this.importRows.some((row) => row.fileSha256 === file.fileSha256 && row.platform === file.platform && row.asOfDate === file.asOfDate),
    };
  }

  private async insertImport(record: NewMetricImport): Promise<void> {
    this.importRows.push(record);
  }

  private async upsert(write: CsvSnapshotWrite): Promise<void> {
    this.snapshotWrites += 1;
    this.snapshots.set(InMemoryMetricImportStore.keyOf(write.publicationId, write.asOfDate), {
      publicationId: write.publicationId,
      asOfDate: write.asOfDate,
      source: 'csv',
      importId: write.importId,
      metrics: write.metrics,
      recordedAt: write.recordedAt.toISOString(),
    });
  }
}

class RecordingQuality implements Pick<QualityScoreService, 'recomputeAfterMetrics'> {
  readonly calls: MetricsRecomputeContext[] = [];

  async recomputeAfterMetrics(context: MetricsRecomputeContext): Promise<boolean> {
    this.calls.push(context);
    return true;
  }
}

/** Two matched-shape rows; only `dQw4w9WgXcQ` has a recorded publication at first. */
const fileBytes = new TextEncoder().encode('Content,Views,Likes\ndQw4w9WgXcQ,1000,10\naaaaaaaaaaa,2000,20\n');

function importInput(dryRun: boolean): ImportMetricsInput {
  return { fields: { platform: 'youtube', asOfDate: AS_OF_DATE }, dryRun, file: fileBytes, importedBy: 'owner', correlationId: null };
}

let store: InMemoryMetricImportStore;
let quality: RecordingQuality;
let handler: ImportMetricsHandler;

function runImport(dryRun: boolean): ReturnType<ImportMetricsHandler['execute']> {
  return handler.execute(new ImportMetricsCommand(importInput(dryRun)));
}

beforeEach(() => {
  store = new InMemoryMetricImportStore();
  store.publications.push(publication('01JDA00000000000000000PB01', 'dQw4w9WgXcQ'));
  quality = new RecordingQuality();
  handler = new ImportMetricsHandler(store, quality);
});

describe('ImportMetricsHandler: dryRun writes nothing at all (R3-AC-08)', () => {
  it('plans and reports, but opens no transaction, writes no row and does not rescore', async () => {
    const report = await runImport(true);
    assert.equal(report.dryRun, true);
    assert.equal(report.importId, null);
    assert.equal(report.matched, 1);
    assert.equal(report.created, 1);
    assert.equal(report.unmatchedTotal, 1);
    assert.equal(report.scoreRecomputed, false);
    assert.equal(store.transactions, 0);
    assert.equal(store.importRows.length, 0);
    assert.equal(store.snapshotWrites, 0);
    assert.equal(store.snapshotCount(), 0);
    assert.equal(quality.calls.length, 0);
  });

  it('writes nothing for a dry run of a file already imported, and reports it as a duplicate', async () => {
    await runImport(false);
    const report = await runImport(true);
    assert.equal(report.duplicateFile, true);
    assert.equal(report.unchanged, 1);
    assert.equal(report.created, 0);
    assert.equal(store.transactions, 1);
    assert.equal(store.importRows.length, 1);
    assert.equal(store.snapshotWrites, 1);
    assert.equal(quality.calls.length, 1);
  });
});

describe('ImportMetricsHandler: the same file twice for the same asOfDate (R3-AC-08)', () => {
  it('writes one metric_imports row and one snapshot the first time', async () => {
    const report = await runImport(false);
    assert.notEqual(report.importId, null);
    assert.equal(report.created, 1);
    assert.equal(report.duplicateFile, false);
    assert.equal(report.scoreRecomputed, true);
    assert.equal(store.importRows.length, 1);
    assert.equal(store.importRows[0]?.importId, report.importId);
    assert.equal(store.snapshotWrites, 1);
    assert.equal(quality.calls.length, 1);
  });

  it('reports created 0, updated 0 the second time and writes no snapshot and no second metric_imports row', async () => {
    await runImport(false);
    const report = await runImport(false);
    assert.equal(report.importId, null);
    assert.equal(report.created, 0);
    assert.equal(report.updated, 0);
    assert.equal(report.unchanged, 1);
    assert.equal(report.duplicateFile, true);
    assert.equal(report.scoreRecomputed, false);
    assert.equal(store.importRows.length, 1);
    assert.equal(store.snapshotWrites, 1);
    assert.equal(store.snapshotCount(), 1);
    assert.equal(quality.calls.length, 1);
  });

  it('still writes a row for a repeated file that now matches a newly recorded publication', async () => {
    await runImport(false);
    store.publications.push(publication('01JDA00000000000000000PB02', 'aaaaaaaaaaa'));
    const report = await runImport(false);
    assert.equal(report.duplicateFile, true);
    assert.equal(report.created, 1);
    assert.equal(report.unchanged, 1);
    assert.notEqual(report.importId, null);
    assert.equal(store.importRows.length, 2);
    assert.equal(store.snapshotWrites, 2);
    assert.equal(store.snapshotCount(), 2);
  });
});
