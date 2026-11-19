import { Command } from '@nestjs/cqrs';
import { type MetricSnapshotView } from '@studio/shared/api';
import { type SaveMetricSnapshotInput } from '../metrics.input';

/**
 * `PUT /runs/:runId/publications/:publicationId/metrics/:asOfDate` (SPEC 0006 sections 4.4, 5.2):
 * the manual form. Saved with source `form`; the same `(publication, asOfDate)` replaces the
 * earlier form snapshot, and on that day it is in force over a `csv` one (B4).
 */
export class SaveMetricSnapshotCommand extends Command<MetricSnapshotView> {
  /** Validated by the handler. */
  constructor(readonly input: SaveMetricSnapshotInput) {
    super();
  }
}
