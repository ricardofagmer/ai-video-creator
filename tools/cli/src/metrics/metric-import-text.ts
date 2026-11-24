import type { MetricImportReport } from '@studio/shared/api';
import { cliText } from '../i18n/messages.js';

function headline(report: MetricImportReport): string {
  const text = cliText().metrics.import;
  const scope = text.scope(report.platform, report.asOfDate);
  if (report.dryRun) return text.dryRun(scope);
  if (report.importId === null) return text.nothingNew(scope);
  return text.recorded(report.importId, scope);
}

/**
 * The owner-facing result of `studio metrics import` (SPEC 0006 section 5.3): counts, skipped rows
 * by line number and issue id, and unmatched platform video ids (max 50, as the report holds them).
 * No cell text is ever part of the report, so none is printed.
 */
export function metricImportReportLines(report: MetricImportReport): string[] {
  const { issues: issueLabels, import: text } = cliText().metrics;
  const lines = [
    headline(report),
    text.counts(report.rows, report.matched, report.created, report.updated, report.unchanged),
    text.leftovers(report.unmatchedTotal, report.issuesTotal, report.ignoredColumns),
  ];
  if (report.duplicateFile) lines.push(text.duplicateFile);
  if (report.issues.length > 0) {
    lines.push(text.skippedHeading);
    for (const issue of report.issues) lines.push(text.skippedLine(issue.line, issueLabels[issue.issue]));
    if (report.issuesTotal > report.issues.length) lines.push(text.andMore(report.issuesTotal - report.issues.length));
  }
  if (report.unmatched.length > 0) {
    lines.push(text.unmatchedHeading);
    for (const entry of report.unmatched) lines.push(`  ${entry.platformVideoId}`);
    if (report.unmatchedTotal > report.unmatched.length) lines.push(text.andMore(report.unmatchedTotal - report.unmatched.length));
  }
  if (report.scoreRecomputed) lines.push(text.scoresRecomputed);
  return lines;
}
