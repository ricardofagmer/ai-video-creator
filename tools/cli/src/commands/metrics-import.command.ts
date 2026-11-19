import type { Platform } from '@studio/shared/metrics';
import { ExitCode } from '../errors/exit-codes.js';
import { metricImportReportLines } from '../metrics/metric-import-text.js';
import { type MetricsImporter } from '../metrics/metrics-importer.js';
import { readBoundedInputFile } from '../terminal/bounded-input-file.js';
import type { CommandDependencies } from './command-dependencies.js';

export interface MetricsImportOptions {
  /** Path of one platform's CSV export; never echoed nor logged. */
  file: string;
  platform: Platform;
  /** `yyyy-mm-dd`. */
  asOfDate: string;
  dryRun: boolean;
}

/**
 * `studio metrics import <file> --platform <p> --as-of <date> [--dry-run]` (SPEC 0006 R3-07): reads
 * the file under the api's 2 MiB cap (a larger file is refused without reading the rest) and hands
 * the bytes to the same `ImportMetricsCommand` handler the api uses. The handler decodes, bounds
 * (5,000 rows, 64 columns), matches and, unless `--dry-run`, writes in one transaction. The CLI
 * itself writes nothing.
 */
export async function metricsImportCommand(
  options: MetricsImportOptions,
  importer: MetricsImporter,
  dependencies: Pick<CommandDependencies, 'printer' | 'signal'>,
): Promise<number> {
  const file = await readBoundedInputFile({ option: 'métricas', path: options.file, maxBytes: importer.maxFileBytes });
  dependencies.signal.throwIfAborted();
  const report = await importer.importFile({ platform: options.platform, asOfDate: options.asOfDate, dryRun: options.dryRun, file });
  for (const line of metricImportReportLines(report)) dependencies.printer.line(line);
  return ExitCode.ok;
}
