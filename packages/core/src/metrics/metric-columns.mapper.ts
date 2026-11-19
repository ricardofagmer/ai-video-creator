import { type PlatformMetricSnapshot, type Prisma } from '@prisma/client';
import { MetricSourceSchema, PlatformMetricsSchema, PlatformSchema, type MetricName, type PlatformMetrics } from '@studio/shared/metrics';
import { type PlatformSnapshotFact } from '../quality/platform-signals';

/*
 * `platform_metric_snapshots` metric columns to and from the shared `PlatformMetrics` shape. Counts
 * are SQLite integers read as `bigint`; every read is re-validated against the shared schema, so a
 * row outside the contract never leaves core as a number. Used by the metrics repositories and by
 * the quality repository, which reads the same columns for the platform term.
 */

/** The metric columns of a snapshot row, selected by every read that needs the numbers. */
export const metricColumnSelect = {
  views: true,
  likes: true,
  comments: true,
  shares: true,
  saves: true,
  impressions: true,
  reach: true,
  followersGained: true,
  watchTimeSeconds: true,
  averageViewDurationSeconds: true,
  averageViewPercent: true,
} as const satisfies Prisma.PlatformMetricSnapshotSelect;

export type MetricColumns = Pick<PlatformMetricSnapshot, keyof typeof metricColumnSelect>;

const metricNames: readonly MetricName[] = Object.keys(metricColumnSelect).filter(isMetricName);

/** True for a canonical `PlatformMetrics` key; profile data keyed by anything else is ignored. */
export function isMetricName(name: string): name is MetricName {
  return Object.prototype.hasOwnProperty.call(PlatformMetricsSchema.shape, name);
}

function countOf(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

function bigintOf(value: number | null): bigint | null {
  return value === null ? null : BigInt(value);
}

/** Row columns to the shared shape; `onCorrupt` names the row when it breaks the contract. */
export function toPlatformMetrics(columns: MetricColumns, onCorrupt: () => Error): PlatformMetrics {
  const parsed = PlatformMetricsSchema.safeParse({
    views: Number(columns.views),
    likes: countOf(columns.likes),
    comments: countOf(columns.comments),
    shares: countOf(columns.shares),
    saves: countOf(columns.saves),
    impressions: countOf(columns.impressions),
    reach: countOf(columns.reach),
    followersGained: countOf(columns.followersGained),
    watchTimeSeconds: countOf(columns.watchTimeSeconds),
    averageViewDurationSeconds: columns.averageViewDurationSeconds,
    averageViewPercent: columns.averageViewPercent,
  });
  if (!parsed.success) throw onCorrupt();
  return parsed.data;
}

/** The shared shape (already validated) to the columns an insert or upsert writes. */
export function toMetricColumns(metrics: PlatformMetrics): MetricColumns {
  return {
    views: BigInt(metrics.views),
    likes: bigintOf(metrics.likes),
    comments: bigintOf(metrics.comments),
    shares: bigintOf(metrics.shares),
    saves: bigintOf(metrics.saves),
    impressions: bigintOf(metrics.impressions),
    reach: bigintOf(metrics.reach),
    followersGained: bigintOf(metrics.followersGained),
    watchTimeSeconds: bigintOf(metrics.watchTimeSeconds),
    averageViewDurationSeconds: metrics.averageViewDurationSeconds,
    averageViewPercent: metrics.averageViewPercent,
  };
}

/** True when every metric is equal; an import row that changes nothing counts as `unchanged`. */
export function sameMetrics(left: PlatformMetrics, right: PlatformMetrics): boolean {
  return metricNames.every((name) => left[name] === right[name]);
}

/** What the platform-term reads select: the snapshot key, its numbers and its publication's run and platform. */
export const platformSnapshotFactSelect = {
  publicationId: true,
  asOfDate: true,
  source: true,
  ...metricColumnSelect,
  publication: { select: { runId: true, platform: true } },
} as const satisfies Prisma.PlatformMetricSnapshotSelect;

export type PlatformSnapshotFactRow = Prisma.PlatformMetricSnapshotGetPayload<{ select: typeof platformSnapshotFactSelect }>;

/** One snapshot row as a fact of the platform term (SPEC 0006 section 5.4); no URL is read. */
export function toPlatformSnapshotFact(row: PlatformSnapshotFactRow, onCorrupt: () => Error): PlatformSnapshotFact {
  const platform = PlatformSchema.safeParse(row.publication.platform);
  const source = MetricSourceSchema.safeParse(row.source);
  if (!platform.success || !source.success) throw onCorrupt();
  return {
    runId: row.publication.runId,
    publicationId: row.publicationId,
    platform: platform.data,
    asOfDate: row.asOfDate,
    source: source.data,
    metrics: toPlatformMetrics(row, onCorrupt),
  };
}
