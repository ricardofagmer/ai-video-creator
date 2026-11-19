import type { TraceExport } from '@studio/shared/telemetry';

/**
 * What `studio traces export` needs to turn an id into an OTLP JSON document. The production adapter
 * (`file-trace-source.ts`) reads the run's or curation's files through the shared C5 helpers and maps
 * them with `@studio/shared/telemetry`; tests pass an in-memory fake, so they load no built package,
 * no data home and no database.
 */
export interface TraceSource {
  /** Throws `TraceExportError('target-not-found')` when neither a run nor a curation has the id. */
  load(targetId: string, signal: AbortSignal): Promise<TraceExport>;
}
