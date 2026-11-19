import type { MetricImportReport } from '@studio/shared/api';
import type { MetricRowIssue } from '@studio/shared/metrics';

const ISSUE_LABELS: Readonly<Record<MetricRowIssue, string>> = {
  'id-missing': 'sem id do vídeo',
  'id-invalid': 'id do vídeo não reconhecido',
  'number-invalid': 'número inválido',
  'date-invalid': 'data inválida',
  'cell-too-long': 'célula longa demais',
  'duplicate-row': 'vídeo repetido no arquivo (vale a primeira linha)',
  'views-missing': 'sem visualizações',
};

function headline(report: MetricImportReport): string {
  const scope = `${report.platform}, dia ${report.asOfDate}`;
  if (report.dryRun) return `Simulação da importação de métricas (${scope}): nada foi gravado.`;
  if (report.importId === null) return `Importação de métricas (${scope}): nada novo para gravar.`;
  return `Importação de métricas ${report.importId} gravada (${scope}).`;
}

/**
 * The owner-facing result of `studio metrics import` (SPEC 0006 section 5.3): counts, skipped rows
 * by line number and issue id, and unmatched platform video ids (max 50, as the report holds them).
 * No cell text is ever part of the report, so none is printed.
 */
export function metricImportReportLines(report: MetricImportReport): string[] {
  const lines = [
    headline(report),
    `Linhas: ${report.rows} · ligadas a uma execução: ${report.matched} · novas: ${report.created} · atualizadas: ${report.updated} · iguais: ${report.unchanged}`,
    `Sem execução ligada: ${report.unmatchedTotal} · linhas puladas: ${report.issuesTotal} · colunas ignoradas: ${report.ignoredColumns}`,
  ];
  if (report.duplicateFile) lines.push('Este arquivo já foi importado para este dia; só linhas novas ou alteradas contam.');
  if (report.issues.length > 0) {
    lines.push('Linhas puladas:');
    for (const issue of report.issues) lines.push(`  linha ${issue.line}: ${ISSUE_LABELS[issue.issue]}`);
    if (report.issuesTotal > report.issues.length) lines.push(`  ... e mais ${report.issuesTotal - report.issues.length}.`);
  }
  if (report.unmatched.length > 0) {
    lines.push('Vídeos sem execução ligada: registre a publicação na página da execução e importe de novo.');
    for (const entry of report.unmatched) lines.push(`  ${entry.platformVideoId}`);
    if (report.unmatchedTotal > report.unmatched.length) lines.push(`  ... e mais ${report.unmatchedTotal - report.unmatched.length}.`);
  }
  if (report.scoreRecomputed) lines.push('Notas de qualidade recalculadas.');
  return lines;
}
