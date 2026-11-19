import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type MetricImportReport } from '@studio/shared/api';
import { type MetricImportRefusedReason, type Platform } from '@studio/shared/metrics';
import { newUlid } from '@studio/shared/run-files';
import { PrismaService, type PrismaTransaction } from '../../prisma';
import { QualityScoreService } from '../../quality';
import { readMetricFile } from '../metric-file.reader';
import { planMetricImport, type MetricImportPlan } from '../metric-import.planner';
import { buildMetricImportReport } from '../metric-import.report';
import { MetricImportRepository } from '../metric-import.repository';
import { type ParsedMetricRows } from '../metric-rows.parser';
import { MetricSnapshotRepository } from '../metric-snapshot.repository';
import { MetricImportRefusedError } from '../metrics.errors';
import { ImportMetricsInputSchema, isAfterLocalToday, parseMetricsInput } from '../metrics.input';
import { RunPublicationRepository } from '../run-publication.repository';
import { ImportMetricsCommand } from './import-metrics.command';

/** One import of up to 5,000 rows holds the SQLite write lock for this long at most. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;
const IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;

/** The validated facts of one import, after the pure stages passed. */
interface ImportContext {
  platform: Platform;
  asOfDate: string;
  dryRun: boolean;
  parsed: ParsedMetricRows;
  fileSha256: string;
  fileBytes: number;
  importedBy: string;
  correlationId: string | null;
  now: Date;
}

interface PlannedImport {
  plan: MetricImportPlan;
  duplicateFile: boolean;
}

interface AppliedImport extends PlannedImport {
  importId: string | null;
  /** True when a snapshot was created or updated, so the score may move. */
  wroteSnapshots: boolean;
}

/**
 * The import pipeline of SPEC 0006 section 5.3. The pure stages (`readMetricFile`) run first and
 * a refusal writes nothing. Then, for a real import, one transaction reads the matching
 * publications and the day's `csv` snapshots, plans, and writes the `metric_imports` row and the
 * snapshot upserts. Idempotency: a repeated row is `unchanged` and not written; a repeated file
 * (same sha-256, platform and day) gets a new `metric_imports` row only when it created or updated
 * a snapshot. The rescore runs after the commit, and only when a snapshot changed.
 */
@CommandHandler(ImportMetricsCommand)
export class ImportMetricsHandler implements ICommandHandler<ImportMetricsCommand, MetricImportReport> {
  private readonly logger = new Logger(ImportMetricsHandler.name);
  /** Imports run one at a time in this process, so two uploads of one file cannot both create. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
    private readonly imports: MetricImportRepository,
    private readonly quality: QualityScoreService,
  ) {}

  async execute(command: ImportMetricsCommand): Promise<MetricImportReport> {
    const startedAt = Date.now();
    const input = parseMetricsInput(ImportMetricsInputSchema, command.input, '');
    const { platform, asOfDate } = input.fields;
    const now = new Date();
    const refusalFacts = { platform, fileBytes: input.file.length, correlationId: input.correlationId };
    if (isAfterLocalToday(asOfDate, now)) throw this.refused('as-of-in-future', refusalFacts);
    const read = readMetricFile(input.file, platform);
    if (read.status === 'refused') throw this.refused(read.refusal, refusalFacts);

    const context: ImportContext = {
      platform,
      asOfDate,
      dryRun: input.dryRun,
      parsed: read.parsed,
      fileSha256: createHash('sha256').update(input.file).digest('hex'),
      fileBytes: input.file.length,
      importedBy: input.importedBy,
      correlationId: input.correlationId,
      now,
    };
    const run = this.tail.then(() => this.apply(context));
    // The chain only orders the imports; each caller still receives its own result or error.
    this.tail = run.catch(() => undefined);
    const applied = await run;
    const scoreRecomputed = applied.wroteSnapshots
      ? await this.quality.recomputeAfterMetrics({ change: 'metrics-imported', correlationId: input.correlationId })
      : false;

    const report = buildMetricImportReport(read.parsed, applied.plan, {
      importId: applied.importId,
      dryRun: input.dryRun,
      platform,
      asOfDate,
      ignoredColumns: read.ignoredColumns,
      duplicateFile: applied.duplicateFile,
      scoreRecomputed,
    });
    // Counts and ids of the import only: no video id, cell or file name (section 7).
    this.logger.log({
      event: 'metrics.imported',
      importId: report.importId,
      platform,
      rows: report.rows,
      matched: report.matched,
      created: report.created,
      updated: report.updated,
      unchanged: report.unchanged,
      unmatched: report.unmatchedTotal,
      issues: report.issuesTotal,
      dryRun: input.dryRun,
      durationMs: Date.now() - startedAt,
      correlationId: input.correlationId,
    });
    return report;
  }

  private refused(
    refusal: MetricImportRefusedReason,
    facts: { platform: Platform; fileBytes: number; correlationId: string | null },
  ): MetricImportRefusedError {
    this.logger.warn({ event: 'metrics.import-refused', platform: facts.platform, reason: refusal, fileBytes: facts.fileBytes, correlationId: facts.correlationId });
    return new MetricImportRefusedError(refusal, facts.platform);
  }

  private async apply(context: ImportContext): Promise<AppliedImport> {
    if (context.dryRun) return { ...(await this.plan(context, this.prisma)), importId: null, wroteSnapshots: false };
    return this.prisma.$transaction((transaction) => this.write(context, transaction), {
      maxWait: IMPORT_TRANSACTION_MAX_WAIT_MS,
      timeout: IMPORT_TRANSACTION_TIMEOUT_MS,
    });
  }

  private async plan(context: ImportContext, db: PrismaTransaction): Promise<PlannedImport> {
    const publications = await this.publications.findByVideoIds(
      context.platform,
      context.parsed.rows.map((row) => row.platformVideoId),
      db,
    );
    const existing = await this.snapshots.findCsvOn(
      publications.map((publication) => publication.publicationId),
      context.asOfDate,
      db,
    );
    const duplicateFile = await this.imports.hasSameFile({ fileSha256: context.fileSha256, platform: context.platform, asOfDate: context.asOfDate }, db);
    return { plan: planMetricImport(context.parsed.rows, publications, existing), duplicateFile };
  }

  private async write(context: ImportContext, transaction: PrismaTransaction): Promise<AppliedImport> {
    const planned = await this.plan(context, transaction);
    const { plan } = planned;
    const changed = plan.created + plan.updated;
    if (planned.duplicateFile && changed === 0) return { ...planned, importId: null, wroteSnapshots: false };
    const importId = newUlid(context.now.getTime());
    await this.imports.insert(
      {
        importId,
        platform: context.platform,
        asOfDate: context.asOfDate,
        fileSha256: context.fileSha256,
        fileBytes: context.fileBytes,
        counts: {
          rows: context.parsed.dataRows,
          matched: plan.matched,
          created: plan.created,
          updated: plan.updated,
          unchanged: plan.unchanged,
          unmatched: plan.unmatchedIds.length,
          issues: context.parsed.issues.length + plan.duplicateIssues.length,
        },
        importedBy: context.importedBy,
        correlationId: context.correlationId,
        importedAt: context.now,
      },
      transaction,
    );
    for (const write of plan.writes) {
      await this.snapshots.upsert(
        { publicationId: write.publicationId, asOfDate: context.asOfDate, source: 'csv', importId, metrics: write.metrics, recordedAt: context.now },
        transaction,
      );
    }
    return { ...planned, importId, wroteSnapshots: changed > 0 };
  }
}
