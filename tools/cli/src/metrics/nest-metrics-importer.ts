import { ImportMetricsCommand } from '@studio/core/metrics';
import { metricsBounds } from '@studio/shared/metrics';
import { withCliContext } from '../nest/cli-context.js';
import { type MetricsImporter } from './metrics-importer.js';

/**
 * Who a CLI import is recorded as. The CLI has no web session; `cli` is the same actor name the
 * CLI records as `createdBy` on runs, and it is never a person's name.
 */
const CLI_METRICS_ACTOR = 'cli';

/** The metrics port backed by the core `ImportMetricsCommand` handler in the CLI's Nest context. */
export const nestMetricsImporter: MetricsImporter = {
  maxFileBytes: metricsBounds.maxFileBytes,
  importFile: (request) =>
    withCliContext((context) =>
      context.commandBus.execute(
        new ImportMetricsCommand({
          fields: { platform: request.platform, asOfDate: request.asOfDate },
          dryRun: request.dryRun,
          file: request.file,
          importedBy: CLI_METRICS_ACTOR,
          correlationId: null,
        }),
      ),
    ),
};
