import { Badge, Table, textLinkClassName, type TableColumn } from '@studio/ui';
import { type RecipeRatingTrend, type RecipeReviewTime, type RunCatalogShare } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatDuration, formatRating, formatShare, targetVerdict } from './insights-labels';

export function VerdictBadge({ isMet }: { isMet: boolean | null }): ReactElement {
  const verdict = targetVerdict(isMet);
  return <Badge tone={verdict.tone}>{verdict.label}</Badge>;
}

const reviewTimeColumns: readonly TableColumn<RecipeReviewTime>[] = [
  { key: 'recipe', header: 'Receita', rowHeader: true, render: (row) => <span className="mono">{row.recipeId}</span> },
  { key: 'runs', header: 'Execuções', align: 'end', render: (row) => row.runs },
  { key: 'first', header: 'Primeira', align: 'end', render: (row) => formatDuration(row.firstRunMs) },
  { key: 'latest', header: 'Mais recente', align: 'end', render: (row) => (row.latestRunMs === null ? '-' : formatDuration(row.latestRunMs)) },
  { key: 'verdict', header: 'Mais rápida que a primeira', render: (row) => <VerdictBadge isMet={row.faster} /> },
];

const ratingColumns: readonly TableColumn<RecipeRatingTrend>[] = [
  { key: 'recipe', header: 'Receita', rowHeader: true, render: (row) => <span className="mono">{row.recipeId}</span> },
  { key: 'latest', header: 'Últimas', align: 'end', render: (row) => `${formatRating(row.latestMean)} (${row.latestCount})` },
  {
    key: 'previous',
    header: 'Anteriores',
    align: 'end',
    render: (row) => (row.previousMean === null ? '-' : `${formatRating(row.previousMean)} (${row.previousCount})`),
  },
  { key: 'verdict', header: 'Nota mantida', render: (row) => <VerdictBadge isMet={row.holding} /> },
];

function catalogColumns(target: number): readonly TableColumn<RunCatalogShare>[] {
  return [
    {
      key: 'run',
      header: 'Execução',
      rowHeader: true,
      render: (row) => (
        <Link href={`/execucoes/${encodeURIComponent(row.runId)}`} className={textLinkClassName()}>
          <span className="mono">{row.runId}</span>
        </Link>
      ),
    },
    { key: 'ordinal', header: 'Nº', align: 'end', render: (row) => row.ordinal },
    { key: 'versions', header: 'Do catálogo', align: 'end', render: (row) => `${row.fromCatalog} de ${row.assetVersions}` },
    { key: 'share', header: 'Parcela', align: 'end', render: (row) => formatShare(row.share) },
    { key: 'verdict', header: 'Meta', render: (row) => <VerdictBadge isMet={row.share === null ? null : row.share >= target} /> },
  ];
}

export function ReviewTimeTable({ rows }: { rows: readonly RecipeReviewTime[] }): ReactElement {
  return (
    <Table
      caption="Tempo do briefing à revisão, por receita"
      hideCaption
      columns={reviewTimeColumns}
      rows={rows}
      rowKey={(row) => row.recipeId}
      emptyText="Nenhuma execução chegou à revisão ainda."
    />
  );
}

export function RatingTrendTable({ rows }: { rows: readonly RecipeRatingTrend[] }): ReactElement {
  return (
    <Table
      caption="Tendência de nota, por receita"
      hideCaption
      columns={ratingColumns}
      rows={rows}
      rowKey={(row) => row.recipeId}
      emptyText="Nenhuma execução foi avaliada ainda."
    />
  );
}

export function CatalogShareTable({ rows, target }: { rows: readonly RunCatalogShare[]; target: number }): ReactElement {
  return (
    <Table
      caption="Ativos do catálogo nas últimas execuções"
      hideCaption
      columns={catalogColumns(target)}
      rows={rows}
      rowKey={(row) => row.runId}
      emptyText="Nenhuma execução com manifesto ainda."
    />
  );
}
