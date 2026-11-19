import { Alert, DescriptionList, type DescriptionItem } from '@studio/ui';
import { type MetricImportReport } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { UNMATCHED_TEXT, formatCount, formatIsoDate, metricRowIssueTexts, platformLabels } from '../metric-labels';
import styles from '../metrics.module.css';

function countItems(report: MetricImportReport): DescriptionItem[] {
  return [
    { term: 'Plataforma', description: platformLabels[report.platform] },
    { term: 'Números referentes a', description: formatIsoDate(report.asOfDate) },
    { term: 'Linhas lidas', description: formatCount(report.rows) },
    { term: 'Com publicação registrada', description: formatCount(report.matched) },
    { term: report.dryRun ? 'Seriam novas' : 'Novas', description: formatCount(report.created) },
    { term: report.dryRun ? 'Seriam atualizadas' : 'Atualizadas', description: formatCount(report.updated) },
    { term: 'Sem mudança', description: formatCount(report.unchanged) },
    { term: 'Linhas com problema', description: formatCount(report.issuesTotal) },
    { term: 'Colunas ignoradas', description: formatCount(report.ignoredColumns) },
  ];
}

function moreText(total: number, shown: number): string | null {
  const hidden = total - shown;
  if (hidden <= 0) return null;
  return hidden === 1 ? 'e mais 1.' : `e mais ${hidden}.`;
}

function ScoreNotice({ report }: { report: MetricImportReport }): ReactElement | null {
  if (report.dryRun) return null;
  if (report.scoreRecomputed) return <Alert variant="success">Importação concluída. As notas das versões usadas foram recalculadas.</Alert>;
  if (report.created + report.updated > 0) {
    return (
      <Alert variant="warning">
        Importação concluída, mas as notas não foram recalculadas agora. Elas serão recalculadas na próxima revisão ou importação; verifique
        com `studio doctor`.
      </Alert>
    );
  }
  return <Alert variant="info">Importação concluída. Nenhuma métrica mudou.</Alert>;
}

/**
 * The `MetricImportReport` of "Conferir" (dry run, nothing written) or "Importar" (SPEC 0006
 * section 5.3): counts, unmatched video ids and skipped rows by line number. The report carries ids
 * and line numbers only, never a cell, and all of it is rendered as text.
 */
export function MetricImportReportView({ report }: { report: MetricImportReport }): ReactElement {
  const unmatchedMore = moreText(report.unmatchedTotal, report.unmatched.length);
  const issuesMore = moreText(report.issuesTotal, report.issues.length);
  return (
    <div className={layout.stack} role="status">
      {report.dryRun && <Alert variant="info">Conferência pronta. Nada foi gravado ainda: confira os números e clique em Importar.</Alert>}
      <ScoreNotice report={report} />
      {report.duplicateFile && (
        <Alert variant="info">
          Este arquivo já tinha sido importado com esta data. Vídeos registrados desde então podem ser encontrados agora; os outros ficam
          sem mudança.
        </Alert>
      )}
      <DescriptionList items={countItems(report)} columns={2} />
      {report.unmatchedTotal > 0 && (
        <section className={layout.stack} aria-label="Vídeos sem execução ligada">
          <p className="body-sm">{UNMATCHED_TEXT}</p>
          <ul className={styles.idList}>
            {report.unmatched.map((entry) => (
              <li key={entry.platformVideoId} className="mono caption">
                {entry.platformVideoId}
              </li>
            ))}
          </ul>
          {unmatchedMore !== null && <p className="caption">{unmatchedMore}</p>}
        </section>
      )}
      {report.issuesTotal > 0 && (
        <section className={layout.stack} aria-label="Linhas com problema">
          <p className="body-sm">Estas linhas foram puladas; o resto do arquivo foi lido normalmente.</p>
          <ul className={styles.issueList}>
            {report.issues.map((entry) => (
              <li key={`${entry.line}|${entry.issue}`} className="caption">{`Linha ${entry.line}: ${metricRowIssueTexts[entry.issue]}`}</li>
            ))}
          </ul>
          {issuesMore !== null && <p className="caption">{issuesMore}</p>}
        </section>
      )}
    </div>
  );
}
