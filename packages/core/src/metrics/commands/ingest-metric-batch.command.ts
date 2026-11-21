import { Command } from '@nestjs/cqrs';
import { CorrelationIdSchema } from '@studio/shared/run-format';
import { MetricBatchIdSchema } from '@studio/shared/platforms';
import { z } from 'zod';

/** `batchId` names one inbox file; null drains every file in `metrics-inbox/`, oldest first. */
export const IngestMetricBatchInputSchema = z
  .object({ batchId: MetricBatchIdSchema.nullable(), correlationId: CorrelationIdSchema.nullable() })
  .strict();
export type IngestMetricBatchInput = z.input<typeof IngestMetricBatchInputSchema>;

/** Counts of one ingest pass; batch ids are logged per file, never a video id or a number. */
export interface MetricBatchIngestSummary {
  /** Files that wrote a `metric_imports` row. */
  ingested: number;
  /** Files whose sha-256 was already ingested: deleted, nothing written. */
  duplicates: number;
  /** Files that failed step 1: logged `metrics.batch-refused` and left in place. */
  refused: number;
  /** True when a snapshot was written and the scores were recomputed after the commit. */
  scoreRecomputed: boolean;
}

/**
 * `IngestMetricBatch` (SPEC 0007 section 5.6), run by `MetricInboxSync` in the api (at start and
 * before `GET /runs/:runId/publications`, `GET /platforms` and `GET /insights`) and by
 * `studio metrics sync`: each pulled batch goes through the R3 import pipeline as one transaction.
 * The watcher never runs it (K1).
 */
export class IngestMetricBatchCommand extends Command<MetricBatchIngestSummary> {
  /** Validated by the handler. */
  constructor(readonly input: IngestMetricBatchInput) {
    super();
  }
}
