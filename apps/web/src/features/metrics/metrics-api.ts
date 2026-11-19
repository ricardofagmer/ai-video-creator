import {
  CreatePublicationRequestSchema,
  MetricImportFieldsSchema,
  MetricImportReportSchema,
  MetricSnapshotViewSchema,
  PublicationViewSchema,
  RemovePublicationResponseSchema,
  RunPublicationsViewSchema,
  SaveMetricSnapshotRequestSchema,
  apiPaths,
  type CreatePublicationRequest,
  type MetricImportFields,
  type MetricImportReport,
  type MetricSnapshotView,
  type PublicationView,
  type RemovePublicationResponse,
  type RunPublicationsView,
  type SaveMetricSnapshotRequest,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/** One CSV upload: the two C10 text fields, the file, and whether it is the "Conferir" dry run. */
export interface MetricImportUpload {
  fields: MetricImportFields;
  file: File;
  dryRun: boolean;
}

/**
 * The C10 rev 5 publication and metrics calls (SPEC 0006 section 4.4). Every body is checked with
 * its C10 schema before it is sent and every response is parsed with its C10 schema. Recording a
 * publication is a record of something the owner did elsewhere: nothing here fetches the link or
 * publishes anything.
 */
export interface MetricsApi {
  listRunPublications(runId: string): Promise<RunPublicationsView>;
  recordPublication(runId: string, request: CreatePublicationRequest): Promise<PublicationView>;
  /** 409 `publication-has-metrics` once the publication has a snapshot. */
  removePublication(runId: string, publicationId: string): Promise<RemovePublicationResponse>;
  /** The manual form: source `form`; the same `(publication, asOfDate)` replaces the earlier one. */
  saveSnapshot(options: { runId: string; publicationId: string; asOfDate: string; metrics: SaveMetricSnapshotRequest }): Promise<MetricSnapshotView>;
  importMetrics(upload: MetricImportUpload): Promise<MetricImportReport>;
}

/**
 * C10 multipart order for `POST /metrics/imports`: the two text fields first, then `file`, so the
 * api's streaming parser has the platform and date before the bytes arrive. The file name is sent
 * because browsers always send one; the api ignores it.
 */
function metricImportMultipart(upload: MetricImportUpload): FormData {
  const fields = checkedBody(MetricImportFieldsSchema, upload.fields);
  const form = new FormData();
  form.append('platform', fields.platform);
  form.append('asOfDate', fields.asOfDate);
  form.append('file', upload.file, 'metricas.csv');
  return form;
}

export function createMetricsApi(transport: ApiTransport): MetricsApi {
  return {
    listRunPublications: (runId) =>
      requestJson(transport, { method: 'GET', path: apiPaths.runPublications(runId) }, RunPublicationsViewSchema),
    recordPublication: (runId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.runPublications(runId),
          body: { kind: 'json', value: checkedBody(CreatePublicationRequestSchema, request) },
        },
        PublicationViewSchema,
      ),
    removePublication: (runId, publicationId) =>
      requestJson(transport, { method: 'DELETE', path: apiPaths.runPublication(runId, publicationId) }, RemovePublicationResponseSchema),
    saveSnapshot: ({ runId, publicationId, asOfDate, metrics }) =>
      requestJson(
        transport,
        {
          method: 'PUT',
          path: apiPaths.runPublicationMetrics({ runId, publicationId, asOfDate }),
          body: { kind: 'json', value: checkedBody(SaveMetricSnapshotRequestSchema, metrics) },
        },
        MetricSnapshotViewSchema,
      ),
    importMetrics: (upload) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.metricImports({ dryRun: upload.dryRun }),
          body: { kind: 'multipart', value: metricImportMultipart(upload) },
        },
        MetricImportReportSchema,
      ),
  };
}

/** The metrics client for client components (same-origin BFF). */
export const browserMetricsApi: MetricsApi = createMetricsApi(browserTransport);
