import type { MetricImportReport } from '@studio/shared/api';
import type { Platform } from '@studio/shared/metrics';

export interface MetricsImportRequest {
  platform: Platform;
  /** `yyyy-mm-dd`: the day the numbers describe; core refuses a future day. */
  asOfDate: string;
  dryRun: boolean;
  /**
   * The file's bytes, held in memory; its name never reaches core (SPEC 0006 section 5.3).
   * `ArrayBuffer`-backed, as core's `ImportMetricsInputSchema` declares.
   */
  file: Uint8Array<ArrayBuffer>;
}

/**
 * What `studio metrics import` needs from core. The production adapter (`nest-metrics-importer.ts`)
 * runs the same `ImportMetricsCommand` handler as `POST /metrics/imports`; a dry run plans and
 * writes nothing (R3-AC-08).
 */
export interface MetricsImporter {
  /** The api's upload cap (`metricsBounds.maxFileBytes`, 2 MiB); the CLI reads no byte past it. */
  readonly maxFileBytes: number;
  importFile(request: MetricsImportRequest): Promise<MetricImportReport>;
}
