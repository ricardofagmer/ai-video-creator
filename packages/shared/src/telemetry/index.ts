/**
 * On-demand OTLP JSON trace export (SPEC 0006 R3-09, ADR 0006 option 2, `@studio/shared/telemetry`):
 * a pure mapper from one run's or curation's `events.jsonl` and session end lines to an OTLP JSON
 * `resourceSpans` document, filtered through the ADR 0006 attribute allowlist. Browser-safe: it
 * imports no Node module, opens no file and makes no request; the CLI reads and writes the files.
 */
export {
  TRACE_ATTRIBUTE_ALLOWLIST,
  TRACE_SERVICE_NAMES,
  allowedAttributes,
  type AllowedAttribute,
  type AllowedAttributes,
  type TraceAttributeInput,
  type TraceAttributeRule,
  type TraceAttributeScope,
} from './allowlist';
export { type CurationTraceSource } from './curation-trace';
export {
  OTLP_SPAN_KIND_INTERNAL,
  OtlpTraceDocumentSchema,
  otlpStatusCode,
  type OtlpAnyValue,
  type OtlpKeyValue,
  type OtlpResourceSpans,
  type OtlpScopeSpans,
  type OtlpSpan,
  type OtlpSpanEvent,
  type OtlpStatusCode,
  type OtlpTraceDocument,
} from './otlp';
export { type RunTraceSource } from './run-trace';
export {
  TRACE_EXPORT_SCOPE,
  mapTraceToOtlp,
  type TraceExport,
  type TraceExportSummary,
  type TraceKind,
  type TraceSourceInput,
} from './trace-export';
