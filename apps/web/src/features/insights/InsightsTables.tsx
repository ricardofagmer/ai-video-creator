import { Badge, Table, textLinkClassName, type Locale, type TableColumn } from '@studio/ui';
import { type RecipeRatingTrend, type RecipeReviewTime, type RunCatalogShare } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { type WebMessages } from '@/messages';
import { formatDuration, formatRating, formatShare, targetVerdict } from './insights-labels';

type InsightTexts = WebMessages['metrics']['insights'];

export function VerdictBadge({ isMet, t }: { isMet: boolean | null; t: InsightTexts }): ReactElement {
  const verdict = targetVerdict(isMet, t);
  return <Badge tone={verdict.tone}>{verdict.label}</Badge>;
}

function reviewTimeColumns(t: InsightTexts): readonly TableColumn<RecipeReviewTime>[] {
  const header = t.reviewTime.columns;
  return [
    { key: 'recipe', header: header.recipe, rowHeader: true, render: (row) => <span className="mono">{row.recipeId}</span> },
    { key: 'runs', header: header.runs, align: 'end', render: (row) => row.runs },
    { key: 'first', header: header.first, align: 'end', render: (row) => formatDuration(row.firstRunMs, t) },
    { key: 'latest', header: header.latest, align: 'end', render: (row) => (row.latestRunMs === null ? '-' : formatDuration(row.latestRunMs, t)) },
    { key: 'verdict', header: header.verdict, render: (row) => <VerdictBadge isMet={row.faster} t={t} /> },
  ];
}

function ratingColumns(t: InsightTexts, locale: Locale): readonly TableColumn<RecipeRatingTrend>[] {
  const header = t.ratingTrend.columns;
  return [
    { key: 'recipe', header: header.recipe, rowHeader: true, render: (row) => <span className="mono">{row.recipeId}</span> },
    { key: 'latest', header: header.latest, align: 'end', render: (row) => `${formatRating(row.latestMean, locale)} (${row.latestCount})` },
    {
      key: 'previous',
      header: header.previous,
      align: 'end',
      render: (row) => (row.previousMean === null ? '-' : `${formatRating(row.previousMean, locale)} (${row.previousCount})`),
    },
    { key: 'verdict', header: header.verdict, render: (row) => <VerdictBadge isMet={row.holding} t={t} /> },
  ];
}

function catalogColumns(target: number, t: InsightTexts, locale: Locale): readonly TableColumn<RunCatalogShare>[] {
  const header = t.catalogRuns.columns;
  return [
    {
      key: 'run',
      header: header.run,
      rowHeader: true,
      render: (row) => (
        <Link href={`/execucoes/${encodeURIComponent(row.runId)}`} className={textLinkClassName()}>
          <span className="mono">{row.runId}</span>
        </Link>
      ),
    },
    { key: 'ordinal', header: header.ordinal, align: 'end', render: (row) => row.ordinal },
    { key: 'versions', header: header.versions, align: 'end', render: (row) => t.catalogRuns.versions(row.fromCatalog, row.assetVersions) },
    { key: 'share', header: header.share, align: 'end', render: (row) => formatShare(row.share, t, locale) },
    { key: 'verdict', header: header.verdict, render: (row) => <VerdictBadge isMet={row.share === null ? null : row.share >= target} t={t} /> },
  ];
}

export function ReviewTimeTable({ rows, t }: { rows: readonly RecipeReviewTime[]; t: InsightTexts }): ReactElement {
  return (
    <Table
      caption={t.reviewTime.caption}
      hideCaption
      columns={reviewTimeColumns(t)}
      rows={rows}
      rowKey={(row) => row.recipeId}
      emptyText={t.reviewTime.empty}
    />
  );
}

export function RatingTrendTable({ rows, t, locale }: { rows: readonly RecipeRatingTrend[]; t: InsightTexts; locale: Locale }): ReactElement {
  return (
    <Table
      caption={t.ratingTrend.caption}
      hideCaption
      columns={ratingColumns(t, locale)}
      rows={rows}
      rowKey={(row) => row.recipeId}
      emptyText={t.ratingTrend.empty}
    />
  );
}

export function CatalogShareTable({
  rows,
  target,
  t,
  locale,
}: {
  rows: readonly RunCatalogShare[];
  target: number;
  t: InsightTexts;
  locale: Locale;
}): ReactElement {
  return (
    <Table
      caption={t.catalogRuns.caption}
      hideCaption
      columns={catalogColumns(target, t, locale)}
      rows={rows}
      rowKey={(row) => row.runId}
      emptyText={t.catalogRuns.empty}
    />
  );
}
