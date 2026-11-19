import { type MetricImportReport } from '@studio/shared/api';
import { metricsBounds, type Platform } from '@studio/shared/metrics';
import { type MetricImportPlan } from './metric-import.planner';
import { type ParsedMetricRows } from './metric-rows.parser';

/** Everything the report needs beyond the parse and the plan. */
export interface MetricImportOutcome {
  importId: string | null;
  dryRun: boolean;
  platform: Platform;
  asOfDate: string;
  ignoredColumns: number;
  duplicateFile: boolean;
  scoreRecomputed: boolean;
}

/**
 * The `MetricImportReport` (SPEC 0006 section 4.4): counts, platform video ids of unmatched rows
 * and issues by line number, each list cut at 50. No cell, title or file name is ever in it.
 * `rows` counts data rows read (summary rows excluded); `matched` counts rows linked to a
 * publication, whether they were created, updated or unchanged.
 */
export function buildMetricImportReport(parsed: ParsedMetricRows, plan: MetricImportPlan, outcome: MetricImportOutcome): MetricImportReport {
  const issues = [...parsed.issues, ...plan.duplicateIssues].sort((left, right) => left.line - right.line);
  return {
    importId: outcome.importId,
    dryRun: outcome.dryRun,
    platform: outcome.platform,
    asOfDate: outcome.asOfDate,
    rows: parsed.dataRows,
    matched: plan.matched,
    created: plan.created,
    updated: plan.updated,
    unchanged: plan.unchanged,
    unmatched: plan.unmatchedIds.slice(0, metricsBounds.maxUnmatchedShown).map((platformVideoId) => ({ platformVideoId })),
    unmatchedTotal: plan.unmatchedIds.length,
    issues: issues.slice(0, metricsBounds.maxIssuesShown),
    issuesTotal: issues.length,
    ignoredColumns: outcome.ignoredColumns,
    duplicateFile: outcome.duplicateFile,
    scoreRecomputed: outcome.scoreRecomputed,
  };
}
