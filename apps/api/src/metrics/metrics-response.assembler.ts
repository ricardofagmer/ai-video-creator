import { Injectable, Logger } from '@nestjs/common';
import {
  MetricImportPageViewSchema,
  MetricImportReportSchema,
  MetricSnapshotViewSchema,
  PublicationViewSchema,
  RemovePublicationResponseSchema,
  RunPublicationsViewSchema,
  type MetricImportPageView,
  type MetricImportReport,
  type MetricSnapshotView,
  type PublicationView,
  type RemovePublicationResponse,
  type RunPublicationsView,
} from '@studio/shared/api';
import { type z } from 'zod';
import { ResponseContractViolationError } from '../platform/api.errors';

/**
 * Answers of the publication, snapshot and import routes (SPEC 0006 sections 4.4, 5.1 to 5.3).
 * Each core result passes the frozen C10 rev 5 schema of its route before it leaves the api: the
 * strict schemas drop nothing silently and the import report's refinement admits platform video ids
 * only, so no cell, file name or URL fragment can reach the web through a contract drift (K7). A
 * mismatch is a 500 with a fixed text; the log names the view and the issue paths, never a value.
 */
@Injectable()
export class MetricsResponseAssembler {
  private readonly logger = new Logger(MetricsResponseAssembler.name);

  publications(view: RunPublicationsView): RunPublicationsView {
    return this.conform(RunPublicationsViewSchema, view, 'RunPublicationsView');
  }

  publication(view: PublicationView): PublicationView {
    return this.conform(PublicationViewSchema, view, 'PublicationView');
  }

  removed(view: RemovePublicationResponse): RemovePublicationResponse {
    return this.conform(RemovePublicationResponseSchema, view, 'RemovePublicationResponse');
  }

  snapshot(view: MetricSnapshotView): MetricSnapshotView {
    return this.conform(MetricSnapshotViewSchema, view, 'MetricSnapshotView');
  }

  importReport(view: MetricImportReport): MetricImportReport {
    return this.conform(MetricImportReportSchema, view, 'MetricImportReport');
  }

  importPage(view: MetricImportPageView): MetricImportPageView {
    return this.conform(MetricImportPageViewSchema, view, 'MetricImportPageView');
  }

  private conform<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown, viewName: string): z.output<Schema> {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const paths = parsed.error.issues.slice(0, 20).map((issue) => issue.path.join('.').slice(0, 200));
    this.logger.error({ event: 'metrics.response-contract-violated', view: viewName, paths });
    throw new ResponseContractViolationError(viewName);
  }
}
