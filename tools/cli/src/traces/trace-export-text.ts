import type { TraceExportSummary, TraceKind } from '@studio/shared/telemetry';

const kindLabels: Readonly<Record<TraceKind, string>> = {
  run: 'execução',
  curation: 'curadoria',
};

/** pt-BR report of one export (D16): ids and counts only, never the `--out` name (SPEC 0006 K7). */
export function traceExportReportLines(summary: TraceExportSummary): string[] {
  return [
    `Rastro exportado: ${kindLabels[summary.kind]} ${summary.targetId}, trace ${summary.traceId}.`,
    `  ${summary.spans} spans e ${summary.spanEvents} eventos de span.`,
    `  Linhas: ${summary.mappedLines} mapeadas, ${summary.unmappedLines} não mapeadas; ${summary.sessionsWithoutEnd} sessões sem linha final.`,
    `  Atributos fora da lista permitida descartados: ${summary.droppedAttributes}.`,
  ];
}
