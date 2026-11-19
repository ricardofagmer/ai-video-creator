import { Command } from '@nestjs/cqrs';
import { type MetricImportReport } from '@studio/shared/api';
import { type ImportMetricsInput } from '../metrics.input';

/**
 * `POST /metrics/imports` and `studio metrics import` (SPEC 0006 section 5.3): one platform's CSV
 * export, matched to recorded publications by video id. A dry run reads and plans and writes
 * nothing; a real import writes one `metric_imports` row and the `csv` snapshots in one transaction.
 */
export class ImportMetricsCommand extends Command<MetricImportReport> {
  /** Validated by the handler. */
  constructor(readonly input: ImportMetricsInput) {
    super();
  }
}
