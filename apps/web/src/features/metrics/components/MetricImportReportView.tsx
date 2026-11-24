'use client';

import { Alert, DescriptionList, useI18n, type DescriptionItem, type Locale } from '@studio/ui';
import { type MetricImportReport } from '@studio/shared/api';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatIsoDate } from '@/lib/i18n/format';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { formatCount, platformLabels } from '../metric-labels';
import styles from '../metrics.module.css';

type ReportTexts = WebMessages['metrics']['report'];

function countItems(report: MetricImportReport, t: ReportTexts, locale: Locale): DescriptionItem[] {
  const count = (value: number): string => formatCount(value, locale);
  return [
    { term: t.platform, description: platformLabels[report.platform] },
    { term: t.asOfDate, description: formatIsoDate(report.asOfDate, locale) },
    { term: t.rows, description: count(report.rows) },
    { term: t.matched, description: count(report.matched) },
    { term: t.created(report.dryRun), description: count(report.created) },
    { term: t.updated(report.dryRun), description: count(report.updated) },
    { term: t.unchanged, description: count(report.unchanged) },
    { term: t.issuesTotal, description: count(report.issuesTotal) },
    { term: t.ignoredColumns, description: count(report.ignoredColumns) },
  ];
}

function moreText(total: number, shown: number, t: ReportTexts): string | null {
  const hidden = total - shown;
  if (hidden <= 0) return null;
  return t.more(hidden);
}

function ScoreNotice({ report, t }: { report: MetricImportReport; t: ReportTexts }): ReactElement | null {
  if (report.dryRun) return null;
  if (report.scoreRecomputed) return <Alert variant="success">{t.scoreRecomputed}</Alert>;
  if (report.created + report.updated > 0) return <Alert variant="warning">{t.scoreNotRecomputed}</Alert>;
  return <Alert variant="info">{t.nothingChanged}</Alert>;
}

/**
 * The `MetricImportReport` of "Conferir" (dry run, nothing written) or "Importar" (SPEC 0006
 * section 5.3): counts, unmatched video ids and skipped rows by line number. The report carries ids
 * and line numbers only, never a cell, and all of it is rendered as text.
 */
export function MetricImportReportView({ report }: { report: MetricImportReport }): ReactElement {
  const t = useWebMessages().metrics.report;
  const { locale } = useI18n();
  const unmatchedMore = moreText(report.unmatchedTotal, report.unmatched.length, t);
  const issuesMore = moreText(report.issuesTotal, report.issues.length, t);
  return (
    <div className={layout.stack} role="status">
      {report.dryRun && <Alert variant="info">{t.dryRunReady}</Alert>}
      <ScoreNotice report={report} t={t} />
      {report.duplicateFile && <Alert variant="info">{t.duplicateFile}</Alert>}
      <DescriptionList items={countItems(report, t, locale)} columns={2} />
      {report.unmatchedTotal > 0 && (
        <section className={layout.stack} aria-label={t.unmatchedLabel}>
          <p className="body-sm">{t.unmatched}</p>
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
        <section className={layout.stack} aria-label={t.issuesLabel}>
          <p className="body-sm">{t.issuesIntro}</p>
          <ul className={styles.issueList}>
            {report.issues.map((entry) => (
              <li key={`${entry.line}|${entry.issue}`} className="caption">
                {t.issueLine(entry.line, t.issues[entry.issue])}
              </li>
            ))}
          </ul>
          {issuesMore !== null && <p className="caption">{issuesMore}</p>}
        </section>
      )}
    </div>
  );
}
