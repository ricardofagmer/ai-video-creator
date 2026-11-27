import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type MetricBatchId } from '@studio/shared/platforms';
import { deleteMetricBatch, listMetricBatchIds, readMetricBatch, type ReadMetricBatch } from '@studio/shared/platforms/files';
import { RunFileError, newUlid } from '@studio/shared/run-files';
import { PrismaService, type PrismaTransaction } from '../../prisma';
import { PLATFORM_FILE_ROOT } from '../../platforms/platform-runtime';
import { QualityScoreService } from '../../quality';
import { SerialMutex } from '../../runtime/keyed-mutex';
import { MetricImportRepository } from '../metric-import.repository';
import { planMetricImport } from '../metric-import.planner';
import { type ParsedMetricRow } from '../metric-rows.parser';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { isAfterLocalToday, parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository } from '../run-publication.repository';
import { IngestMetricBatchCommand, IngestMetricBatchInputSchema, type MetricBatchIngestSummary } from './ingest-metric-batch.command';

/** One pulled batch holds at most 50 rows; the write lock is held far shorter than a CSV import's. */
const INGEST_TRANSACTION_TIMEOUT_MS = 15_000;
const INGEST_TRANSACTION_MAX_WAIT_MS = 10_000;

/** The pulled batch's importer: never a person, never from a request (SPEC 0007 section 5.6 step 3). */
const BATCH_IMPORTED_BY = 'watcher';

type BatchOutcome = { status: 'ingested'; importId: string; wroteSnapshots: boolean } | { status: 'duplicate' } | { status: 'refused' };

/**
 * `IngestMetricBatch` (SPEC 0007 section 5.6), in order per inbox file:
 * 1. read: at most 256 KiB, strict schema; a failure is logged `metrics.batch-refused` and the file
 *    stays in place, never guessed (a future `asOfDate` is refused the same way);
 * 2. `file_sha256` already in `metric_imports`: delete the file, write nothing;
 * 3. one transaction: a `metric_imports` row (`origin = 'api'`, `imported_by = 'watcher'`, the R3
 *    counts) and, through the R3 planner, the `csv` snapshot upsert keyed
 *    `(publicationId, asOfDate, 'csv')` with `importId` set, for each row whose publication still
 *    exists and matches the batch mode (B6); every other row counts `unmatched`;
 * 4. after the commit: delete the file, then `recomputeAfterMetrics` once for the pass.
 * The duplicate check runs again inside the transaction, and files are ingested one at a time in
 * this process, so one batch ingested twice writes one `metric_imports` row (AC 55).
 */
@CommandHandler(IngestMetricBatchCommand)
export class IngestMetricBatchHandler implements ICommandHandler<IngestMetricBatchCommand, MetricBatchIngestSummary> {
  private readonly logger = new Logger(IngestMetricBatchHandler.name);
  private readonly passes = new SerialMutex();

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    private readonly prisma: PrismaService,
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
    private readonly imports: MetricImportRepository,
    @Inject(QualityScoreService) private readonly quality: Pick<QualityScoreService, 'recomputeAfterMetrics'>,
  ) {}

  async execute(command: IngestMetricBatchCommand): Promise<MetricBatchIngestSummary> {
    const input = parseMetricsInput(IngestMetricBatchInputSchema, command.input, '');
    // The mutex only orders the passes; each caller still receives its own result or error.
    const summary = await this.passes.run(() => this.ingestAll(input.batchId, input.correlationId));
    const scoreRecomputed = summary.scoreRecomputed
      ? await this.quality.recomputeAfterMetrics({ change: 'metrics-batch-ingested', correlationId: input.correlationId })
      : false;
    return { ...summary, scoreRecomputed };
  }

  private async ingestAll(batchId: MetricBatchId | null, correlationId: string | null): Promise<MetricBatchIngestSummary> {
    const summary: MetricBatchIngestSummary = { ingested: 0, duplicates: 0, refused: 0, scoreRecomputed: false };
    const batchIds = batchId === null ? await listMetricBatchIds(this.platformRoot) : [batchId];
    for (const id of batchIds) {
      const outcome = await this.ingestOne(id, correlationId);
      if (outcome.status === 'refused') summary.refused += 1;
      if (outcome.status === 'duplicate') summary.duplicates += 1;
      if (outcome.status === 'ingested') {
        summary.ingested += 1;
        summary.scoreRecomputed = summary.scoreRecomputed || outcome.wroteSnapshots;
      }
    }
    return summary;
  }

  private async ingestOne(batchId: MetricBatchId, correlationId: string | null): Promise<BatchOutcome> {
    const read = await this.read(batchId, correlationId);
    if (read === null) return { status: 'refused' };
    if (await this.imports.hasFileHash(read.sha256)) {
      await deleteMetricBatch(this.platformRoot, batchId);
      this.logger.log({ event: 'metrics.batch-duplicate', batchId, platform: read.value.platform, correlationId });
      return { status: 'duplicate' };
    }
    const outcome = await this.prisma.$transaction((transaction) => this.write({ read, correlationId }, transaction), {
      maxWait: INGEST_TRANSACTION_MAX_WAIT_MS,
      timeout: INGEST_TRANSACTION_TIMEOUT_MS,
    });
    // Step 4: only after the commit, so a failed transaction leaves the file for the next pass.
    await deleteMetricBatch(this.platformRoot, batchId);
    if (outcome.status === 'ingested') {
      const { platform, mode, rows } = read.value;
      this.logger.log({ event: 'metrics.batch-ingested', batchId, importId: outcome.importId, platform, mode, rows: rows.length, correlationId });
    }
    return outcome;
  }

  /** Step 1; null when the file is refused (logged, left in place). */
  private async read(batchId: MetricBatchId, correlationId: string | null): Promise<ReadMetricBatch | null> {
    try {
      const read = await readMetricBatch(this.platformRoot, batchId);
      if (!isAfterLocalToday(read.value.asOfDate, new Date())) return read;
      this.logger.warn({ event: 'metrics.batch-refused', batchId, reason: 'as-of-in-future', correlationId });
      return null;
    } catch (error) {
      if (!(error instanceof RunFileError)) throw error;
      // The error class and code only: its message names the file path.
      this.logger.warn({ event: 'metrics.batch-refused', batchId, reason: error.code, errorName: error.name, correlationId });
      return null;
    }
  }

  /** Step 3, inside one transaction. */
  private async write(context: { read: ReadMetricBatch; correlationId: string | null }, db: PrismaTransaction): Promise<BatchOutcome> {
    const { read } = context;
    const batch = read.value;
    // A concurrent ingester (the CLI) may have committed the same bytes since the first check.
    if (await this.imports.hasFileHash(read.sha256, db)) return { status: 'duplicate' };
    const publications = await this.publications.findForBatch(
      { platform: batch.platform, mode: batch.mode, publicationIds: batch.rows.map((row) => row.publicationId) },
      db,
    );
    const videoIdOf = new Map(publications.map((publication) => [publication.publicationId, publication.platformVideoId]));
    const rows: ParsedMetricRow[] = batch.rows.flatMap((row, index) => {
      const platformVideoId = videoIdOf.get(row.publicationId);
      return platformVideoId === undefined ? [] : [{ line: index + 1, platformVideoId, metrics: row.metrics }];
    });
    const existing = await this.snapshots.findCsvOn([...videoIdOf.keys()], batch.asOfDate, db);
    const plan = planMetricImport(rows, publications, existing);
    const importedAt = new Date();
    const importId = newUlid(importedAt.getTime());
    await this.imports.insert(
      {
        importId,
        platform: batch.platform,
        asOfDate: batch.asOfDate,
        fileSha256: read.sha256,
        fileBytes: read.sizeBytes,
        counts: {
          rows: batch.rows.length,
          matched: plan.matched,
          created: plan.created,
          updated: plan.updated,
          unchanged: plan.unchanged,
          unmatched: batch.rows.length - rows.length + plan.unmatchedIds.length,
          issues: plan.duplicateIssues.length,
        },
        importedBy: BATCH_IMPORTED_BY,
        correlationId: context.correlationId,
        importedAt,
        origin: 'api',
      },
      db,
    );
    for (const write of plan.writes) {
      await this.snapshots.upsert(
        { publicationId: write.publicationId, asOfDate: batch.asOfDate, source: 'csv', importId, metrics: write.metrics, recordedAt: importedAt },
        db,
      );
    }
    return { status: 'ingested', importId, wroteSnapshots: plan.writes.length > 0 };
  }
}
