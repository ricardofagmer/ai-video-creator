import { allowedAttributes } from './allowlist';
import { mapCurationTrace, type CurationTraceSource } from './curation-trace';
import { type OtlpTraceDocument } from './otlp';
import { mapRunTrace, type RunTraceSource } from './run-trace';
import { type MappedTrace } from './span-tree';
import { traceIdFor } from './trace-ids';

/** The instrumentation scope of every exported span. */
export const TRACE_EXPORT_SCOPE = { name: 'video-studio.traces', version: '1' } as const;

/** The watcher is the single writer of every file the export reads (RUN-FORMAT sections 4 and 23). */
const SOURCE_SERVICE_NAME = 'engineos-video-creator-watcher';

export type TraceKind = 'run' | 'curation';

export type TraceSourceInput = ({ kind: 'run' } & RunTraceSource) | ({ kind: 'curation' } & CurationTraceSource);

/** Ids and counts only (SPEC 0006 K7); safe to print and log. */
export interface TraceExportSummary {
  kind: TraceKind;
  /** The `runId` or `curationId`. */
  targetId: string;
  traceId: string;
  spans: number;
  spanEvents: number;
  mappedLines: number;
  unmappedLines: number;
  droppedAttributes: number;
  sessionsWithoutEnd: number;
}

export interface TraceExport {
  document: OtlpTraceDocument;
  summary: TraceExportSummary;
}

function mapSource(input: TraceSourceInput): { targetId: string; mapped: MappedTrace } {
  if (input.kind === 'run') return { targetId: input.runId, mapped: mapRunTrace(input) };
  return { targetId: input.curationId, mapped: mapCurationTrace(input) };
}

/**
 * Maps one run's or one curation's `events.jsonl` and session end lines to an OTLP JSON document
 * with exactly one resource, one scope and one trace (ADR 0006 option 2). Pure and deterministic:
 * the same lines give a byte-identical document. Every attribute passes the ADR 0006 allowlist;
 * resource attributes are `service.name` only, since the files do not record the writer's version.
 */
export function mapTraceToOtlp(input: TraceSourceInput): TraceExport {
  const { targetId, mapped } = mapSource(input);
  const traceId = traceIdFor(`${input.kind}:${targetId}`);
  const built = mapped.tree.build(traceId);
  const resource = allowedAttributes({ 'service.name': SOURCE_SERVICE_NAME }, 'resource');
  const document: OtlpTraceDocument = {
    resourceSpans: [
      {
        resource: { attributes: resource.attributes },
        scopeSpans: [{ scope: { name: TRACE_EXPORT_SCOPE.name, version: TRACE_EXPORT_SCOPE.version }, spans: built.spans }],
      },
    ],
  };
  return {
    document,
    summary: {
      kind: input.kind,
      targetId,
      traceId,
      spans: built.spans.length,
      spanEvents: built.spanEvents,
      mappedLines: mapped.mappedLines,
      unmappedLines: mapped.unmappedLines,
      droppedAttributes: built.droppedAttributes + resource.dropped,
      sessionsWithoutEnd: mapped.sessionsWithoutEnd,
    },
  };
}
