import {
  PlatformMetricsSchema,
  headerKey,
  isPlatformVideoId,
  metricCellParsers,
  parsePublicationUrl,
  type CsvRow,
  type MetricCellParser,
  type MetricName,
  type MetricRowIssue,
  type Platform,
  type PlatformMetrics,
} from '@studio/shared/metrics';
import { isMetricName } from './metric-columns.mapper';
import { type PlatformProfile } from './profiles';

/*
 * The map and parse stages of a metrics import (SPEC 0006 section 5.3). Pure: header text is
 * matched against the profile's allowlist, every other column is counted and dropped before any
 * cell is read, and numbers come only from the shared regex parsers. No cell is evaluated, and no
 * text cell (title, caption, description) survives this stage.
 */

interface MappedColumn {
  metric: MetricName;
  index: number;
  parser: MetricCellParser;
}

export type ColumnMapping =
  | { status: 'mapped'; idIndex: number; columns: MappedColumn[]; ignoredColumns: number }
  | { status: 'refused'; reason: 'required-column-missing' };

export type MappedColumns = Extract<ColumnMapping, { status: 'mapped' }>;

/** One data row that passed every check: its line, its platform video id and its metrics. */
export interface ParsedMetricRow {
  line: number;
  platformVideoId: string;
  metrics: PlatformMetrics;
}

/** A skipped row, reported by its 1-based line number only. */
export interface MetricRowIssueAt {
  line: number;
  issue: MetricRowIssue;
}

export interface ParsedMetricRows {
  rows: ParsedMetricRow[];
  issues: MetricRowIssueAt[];
  /** Data rows read, summary rows (`skipRow`) excluded. */
  dataRows: number;
}

function firstIndexOf(headerKeys: readonly string[], aliases: readonly string[], taken: ReadonlySet<number>): number {
  return headerKeys.findIndex((key, index) => !taken.has(index) && aliases.includes(key));
}

/**
 * Maps header cells to the profile's canonical columns. The id column is the first of the
 * profile's id columns present; each metric takes the first unused header matching one of its
 * aliases. Missing the id column or a required metric refuses the import.
 */
export function mapMetricColumns(header: readonly string[], profile: PlatformProfile): ColumnMapping {
  const headerKeys = header.map(headerKey);
  const taken = new Set<number>();
  let idIndex = -1;
  for (const idColumn of profile.idColumns) {
    idIndex = headerKeys.indexOf(idColumn);
    if (idIndex !== -1) break;
  }
  if (idIndex === -1) return { status: 'refused', reason: 'required-column-missing' };
  taken.add(idIndex);
  const columns: MappedColumn[] = [];
  for (const [metric, column] of Object.entries(profile.columns)) {
    if (column === undefined || !isMetricName(metric)) continue;
    const index = firstIndexOf(headerKeys, column.aliases, taken);
    if (index === -1) continue;
    taken.add(index);
    columns.push({ metric, index, parser: column.parser });
  }
  const mappedMetrics = new Set(columns.map((column) => column.metric));
  if (!profile.required.every((metric) => mappedMetrics.has(metric))) return { status: 'refused', reason: 'required-column-missing' };
  return { status: 'mapped', idIndex, columns, ignoredColumns: header.length - taken.size };
}

type IdResult = { status: 'id'; platformVideoId: string } | { status: 'issue'; issue: MetricRowIssue };

/** The id cell as a bare platform video id, or as a full video URL of the same platform. */
function readVideoId(cell: string, platform: Platform): IdResult {
  const text = cell.trim();
  if (text === '') return { status: 'issue', issue: 'id-missing' };
  if (isPlatformVideoId(platform, text)) return { status: 'id', platformVideoId: text };
  const parsed = parsePublicationUrl(text);
  if (parsed.status === 'recognized' && parsed.platform === platform) return { status: 'id', platformVideoId: parsed.platformVideoId };
  return { status: 'issue', issue: 'id-invalid' };
}

type MetricsResult = { status: 'metrics'; metrics: PlatformMetrics } | { status: 'issue'; issue: MetricRowIssue };

const emptyMetrics: Readonly<Omit<PlatformMetrics, 'views'>> = Object.freeze({
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  impressions: null,
  reach: null,
  followersGained: null,
  watchTimeSeconds: null,
  averageViewDurationSeconds: null,
  averageViewPercent: null,
});

function readMetrics(cells: readonly string[], columns: readonly MappedColumn[]): MetricsResult {
  const values: Record<string, number | null> = { ...emptyMetrics };
  for (const column of columns) {
    const parsed = metricCellParsers[column.parser](cells[column.index] ?? '');
    if (parsed.status === 'invalid') return { status: 'issue', issue: 'number-invalid' };
    if (parsed.status === 'empty' && column.metric === 'views') return { status: 'issue', issue: 'views-missing' };
    values[column.metric] = parsed.status === 'value' ? parsed.value : null;
  }
  // The schema bounds (integer counts up to 10^12, percent up to 1000, duration up to a day) decide.
  const checked = PlatformMetricsSchema.safeParse(values);
  return checked.success ? { status: 'metrics', metrics: checked.data } : { status: 'issue', issue: 'number-invalid' };
}

/**
 * Parses each data row: a summary row is skipped silently; any other failure is one row issue,
 * the row is skipped and the import continues. A row with a cell cut at `maxCellChars` is an
 * issue, because the reader cannot say which cell was cut.
 */
export function parseMetricRows(csvRows: readonly CsvRow[], mapping: MappedColumns, profile: PlatformProfile): ParsedMetricRows {
  const result: ParsedMetricRows = { rows: [], issues: [], dataRows: 0 };
  for (const row of csvRows) {
    const idCell = row.cells[mapping.idIndex] ?? '';
    if (profile.skipRow(idCell)) continue;
    result.dataRows += 1;
    if (row.cellTooLong) {
      result.issues.push({ line: row.line, issue: 'cell-too-long' });
      continue;
    }
    const id = readVideoId(idCell, profile.platform);
    if (id.status === 'issue') {
      result.issues.push({ line: row.line, issue: id.issue });
      continue;
    }
    const metrics = readMetrics(row.cells, mapping.columns);
    if (metrics.status === 'issue') {
      result.issues.push({ line: row.line, issue: metrics.issue });
      continue;
    }
    result.rows.push({ line: row.line, platformVideoId: id.platformVideoId, metrics: metrics.metrics });
  }
  return result;
}
