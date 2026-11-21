import { createHash } from 'node:crypto';
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type MetricImportReport } from '@studio/shared/api';
import { type MetricImportRefusedReason, type Platform } from '@studio/shared/metrics';
import { newUlid } from '@studio/shared/run-files';
import { QualityScoreService } from '../../quality';
import { readMetricFile } from '../metric-file.reader';
import { planMetricImport, type MetricImportPlan } from '../metric-import.planner';
import { buildMetricImportReport } from '../metric-import.report';
import { PrismaMetricImportStore, type MetricImportReads, type MetricImportStore, type MetricImportWrites } from '../metric-import.store';
import { type ParsedMetricRows } from '../metric-rows.parser';
import { MetricImportRefusedError } from '../metrics.errors';
import { ImportMetricsInputSchema, isAfterLocalToday, parseMetricsInput } from '../metrics.input';
import { ImportMetricsCommand } from './import-metrics.command';

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
    @Inject(PrismaMetricImportStore) private readonly store: MetricImportStore,
    @Inject(QualityScoreService) private readonly quality: Pick<QualityScoreService, 'recomputeAfterMetrics'>,
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
    // A dry run gets the read side only: it has no method that writes (R3-AC-08).
    if (context.dryRun) return { ...(await this.store.read((reads) => this.plan(context, reads))), importId: null, wroteSnapshots: false };
    return this.store.transaction((writes) => this.write(context, writes));
  }

  private async plan(context: ImportContext, reads: MetricImportReads): Promise<PlannedImport> {
    const publications = await reads.findPublications(
      context.platform,
      context.parsed.rows.map((row) => row.platformVideoId),
    );
    const existing = await reads.findCsvSnapshots(
      publications.map((publication) => publication.publicationId),
      context.asOfDate,
    );
    const duplicateFile = await reads.hasSameFile({ fileSha256: context.fileSha256, platform: context.platform, asOfDate: context.asOfDate });
    return { plan: planMetricImport(context.parsed.rows, publications, existing), duplicateFile };
  }

  private async write(context: ImportContext, writes: MetricImportWrites): Promise<AppliedImport> {
    const planned = await this.plan(context, writes);
    const { plan } = planned;
    const changed = plan.created + plan.updated;
    if (planned.duplicateFile && changed === 0) return { ...planned, importId: null, wroteSnapshots: false };
    const importId = newUlid(context.now.getTime());
    await writes.insertImport({
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
      origin: 'upload',
    });
    for (const write of plan.writes) {
      await writes.upsertCsvSnapshot({ publicationId: write.publicationId, asOfDate: context.asOfDate, importId, metrics: write.metrics, recordedAt: context.now });
    }
    return { ...planned, importId, wroteSnapshots: changed > 0 };
  }
}
