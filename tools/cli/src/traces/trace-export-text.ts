import type { TraceExportSummary } from '@studio/shared/telemetry';
import { cliText } from '../i18n/messages.js';

/** Report of one export in the active language: ids and counts only, never the `--out` name (SPEC 0006 K7). */
export function traceExportReportLines(summary: TraceExportSummary): string[] {
  const text = cliText().traces;
  return [
    text.exported(text.kinds[summary.kind], summary.targetId, summary.traceId),
    text.spans(summary.spans, summary.spanEvents),
    text.lines(summary.mappedLines, summary.unmappedLines, summary.sessionsWithoutEnd),
    text.dropped(summary.droppedAttributes),
  ];
}
