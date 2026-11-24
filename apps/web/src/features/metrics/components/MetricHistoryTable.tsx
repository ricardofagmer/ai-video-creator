import { Table, type Locale, type TableColumn } from '@studio/ui';
import { type MetricSnapshotView } from '@studio/shared/api';
import { engagementRate } from '@studio/shared/metrics';
import type { ReactElement } from 'react';
import { formatIsoDate } from '@/lib/i18n/format';
import { type WebMessages } from '@/messages';
import { formatCount, formatPercentValue, formatRate, snapshotOriginLabel } from '../metric-labels';

interface MetricRow {
  snapshot: MetricSnapshotView;
  inForce: boolean;
}

function historyColumns(t: WebMessages['metrics'], locale: Locale): readonly TableColumn<MetricRow>[] {
  const h = t.history;
  const count = (value: number | null): string => formatCount(value, locale);
  return [
    {
      key: 'date',
      header: h.date,
      rowHeader: true,
      render: (row) => (row.inForce ? h.inForce(formatIsoDate(row.snapshot.asOfDate, locale)) : formatIsoDate(row.snapshot.asOfDate, locale)),
    },
    { key: 'source', header: h.source, render: (row) => snapshotOriginLabel(row.snapshot, t) },
    { key: 'views', header: t.fields.views, align: 'end', render: (row) => count(row.snapshot.metrics.views) },
    { key: 'likes', header: t.fields.likes, align: 'end', render: (row) => count(row.snapshot.metrics.likes) },
    { key: 'comments', header: t.fields.comments, align: 'end', render: (row) => count(row.snapshot.metrics.comments) },
    { key: 'shares', header: t.fields.shares, align: 'end', render: (row) => count(row.snapshot.metrics.shares) },
    { key: 'engagement', header: h.engagement, align: 'end', render: (row) => formatRate(engagementRate(row.snapshot.metrics), locale) },
    { key: 'retention', header: h.watched, align: 'end', render: (row) => formatPercentValue(row.snapshot.metrics.averageViewPercent, locale) },
  ];
}

/**
 * The snapshot in force and the older ones of one publication (SPEC 0006 sections 5.2 and 5.9),
 * newest first. `engagementRate` is derived on read with the shared function, never stored. Rev 7
 * (SPEC 0007 section 4.1): "Origem" tells a form, a CSV upload and a pulled API snapshot apart.
 */
export function MetricHistoryTable({
  inForce,
  history,
  caption,
  t,
  locale,
}: {
  inForce: MetricSnapshotView | null;
  history: readonly MetricSnapshotView[];
  caption: string;
  t: WebMessages['metrics'];
  locale: Locale;
}): ReactElement {
  const rows: MetricRow[] = [
    ...(inForce === null ? [] : [{ snapshot: inForce, inForce: true }]),
    ...history.map((snapshot) => ({ snapshot, inForce: false })),
  ];
  return (
    <Table
      caption={caption}
      hideCaption
      columns={historyColumns(t, locale)}
      rows={rows}
      rowKey={(row) => `${row.snapshot.asOfDate}|${row.snapshot.source}`}
      emptyText={t.history.empty}
    />
  );
}
