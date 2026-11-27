import {
  IsoDateSchema,
  PlatformMetricsSchema,
  metricCellParsers,
  type MetricCellParser,
  type MetricName,
  type PlatformMetrics,
} from '@studio/shared/metrics';
import { type WebMessages } from '@/messages';

/*
 * The manual metrics form of the run page (SPEC 0006 section 5.9): one text field per
 * `PlatformMetrics` value, read with the same cell parsers the CSV import uses, so "4.000", "45%"
 * and "1:23" mean the same in both. Only `views` is required. The api validates again.
 */

/** How each field is read; its label is `t.metrics.fields`, its help `t.metrics.fieldHelp`. */
export const metricFieldParsers: Readonly<Record<MetricName, MetricCellParser>> = {
  views: 'integer',
  likes: 'integer',
  comments: 'integer',
  shares: 'integer',
  saves: 'integer',
  impressions: 'integer',
  reach: 'integer',
  followersGained: 'integer',
  watchTimeSeconds: 'hours',
  averageViewDurationSeconds: 'duration',
  averageViewPercent: 'percent',
};

export const metricFieldOrder: readonly MetricName[] = [
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'impressions',
  'reach',
  'followersGained',
  'watchTimeSeconds',
  'averageViewDurationSeconds',
  'averageViewPercent',
];

export type MetricFormValues = Readonly<Record<MetricName, string>>;

export type MetricFormErrors = Partial<Record<MetricName | 'asOfDate', string>>;

export function emptyMetricValues(): MetricFormValues {
  return {
    views: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
    impressions: '',
    reach: '',
    followersGained: '',
    watchTimeSeconds: '',
    averageViewDurationSeconds: '',
    averageViewPercent: '',
  };
}

export type MetricFormResult =
  | { kind: 'valid'; asOfDate: string; metrics: PlatformMetrics }
  | { kind: 'invalid'; errors: MetricFormErrors };

/** `null` for an empty field, the parsed number, or `'invalid'`. */
function readField(name: MetricName, text: string): number | null | 'invalid' {
  const parsed = metricCellParsers[metricFieldParsers[name]](text);
  if (parsed.status === 'empty') return null;
  if (parsed.status === 'invalid') return 'invalid';
  return parsed.value;
}

/**
 * Builds the C10 `SaveMetricSnapshotRequest` and validates the date against `today` (the api
 * refuses a future `asOfDate`; this only spares the round trip).
 */
export function buildMetricSnapshot(
  options: { asOfDate: string; values: MetricFormValues; today: string },
  t: WebMessages['metrics']['snapshotForm']['errors'],
): MetricFormResult {
  const errors: MetricFormErrors = {};
  if (!IsoDateSchema.safeParse(options.asOfDate).success) errors.asOfDate = t.asOfDate;
  else if (options.asOfDate > options.today) errors.asOfDate = t.future;

  const read: Partial<Record<MetricName, number | null>> = {};
  for (const name of metricFieldOrder) {
    const value = readField(name, options.values[name]);
    if (value === 'invalid') errors[name] = t.number;
    else read[name] = value;
  }
  if (errors.views === undefined && (read.views === null || read.views === undefined)) errors.views = t.views;

  const candidate = {
    views: read.views ?? 0,
    likes: read.likes ?? null,
    comments: read.comments ?? null,
    shares: read.shares ?? null,
    saves: read.saves ?? null,
    impressions: read.impressions ?? null,
    reach: read.reach ?? null,
    followersGained: read.followersGained ?? null,
    watchTimeSeconds: read.watchTimeSeconds ?? null,
    averageViewDurationSeconds: read.averageViewDurationSeconds ?? null,
    averageViewPercent: read.averageViewPercent ?? null,
  };
  const parsed = PlatformMetricsSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = metricFieldOrder.find((name) => name === issue.path[0]);
      if (field !== undefined && errors[field] === undefined) errors[field] = t.outOfRange;
    }
    if (Object.keys(errors).length === 0) errors.views = t.outOfRange;
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { kind: 'invalid', errors };
  return { kind: 'valid', asOfDate: options.asOfDate, metrics: parsed.data };
}
