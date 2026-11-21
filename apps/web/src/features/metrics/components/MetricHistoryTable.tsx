import { Table, type TableColumn } from '@studio/ui';
import { type MetricSnapshotView } from '@studio/shared/api';
import { engagementRate } from '@studio/shared/metrics';
import type { ReactElement } from 'react';
import { formatCount, formatIsoDate, formatPercentValue, formatRate, snapshotOriginLabel } from '../metric-labels';

interface MetricRow {
  snapshot: MetricSnapshotView;
  inForce: boolean;
}

const columns: readonly TableColumn<MetricRow>[] = [
  {
    key: 'date',
    header: 'Data',
    rowHeader: true,
    render: (row) => (row.inForce ? `${formatIsoDate(row.snapshot.asOfDate)} (em vigor)` : formatIsoDate(row.snapshot.asOfDate)),
  },
  { key: 'source', header: 'Origem', render: (row) => snapshotOriginLabel(row.snapshot) },
  { key: 'views', header: 'Visualizações', align: 'end', render: (row) => formatCount(row.snapshot.metrics.views) },
  { key: 'likes', header: 'Curtidas', align: 'end', render: (row) => formatCount(row.snapshot.metrics.likes) },
  { key: 'comments', header: 'Comentários', align: 'end', render: (row) => formatCount(row.snapshot.metrics.comments) },
  { key: 'shares', header: 'Compartilhamentos', align: 'end', render: (row) => formatCount(row.snapshot.metrics.shares) },
  { key: 'engagement', header: 'Engajamento', align: 'end', render: (row) => formatRate(engagementRate(row.snapshot.metrics)) },
  { key: 'retention', header: 'Assistido', align: 'end', render: (row) => formatPercentValue(row.snapshot.metrics.averageViewPercent) },
];

/**
 * The snapshot in force and the older ones of one publication (SPEC 0006 sections 5.2 and 5.9),
 * newest first. `engagementRate` is derived on read with the shared function, never stored. Rev 7
 * (SPEC 0007 section 4.1): "Origem" tells a form, a CSV upload and a pulled API snapshot apart.
 */
export function MetricHistoryTable({
  inForce,
  history,
  caption,
}: {
  inForce: MetricSnapshotView | null;
  history: readonly MetricSnapshotView[];
  caption: string;
}): ReactElement {
  const rows: MetricRow[] = [
    ...(inForce === null ? [] : [{ snapshot: inForce, inForce: true }]),
    ...history.map((snapshot) => ({ snapshot, inForce: false })),
  ];
  return (
    <Table
      caption={caption}
      hideCaption
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.snapshot.asOfDate}|${row.snapshot.source}`}
      emptyText="Nenhuma métrica registrada ainda."
    />
  );
}
