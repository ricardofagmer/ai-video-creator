import { Badge, EmptyState, PageHeader, Table, buttonClassName, formatUsd, textLinkClassName, type Locale, type TableColumn } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import { ComparisonIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { comparisonStatusTones, subjectText } from '@/features/comparisons/comparison-labels';
import { serverComparisonsApi } from '@/features/comparisons/comparisons-api.server';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime } from '@/features/runs/run-labels';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.curations.comparisons.list.title };
}
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface ComparisonsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function comparisonColumns(t: WebMessages, locale: Locale): readonly TableColumn<ComparisonView>[] {
  const texts = t.curations.comparisons;
  const header = texts.list.columns;
  return [
  {
    key: 'title',
    header: header.title,
    rowHeader: true,
    render: (comparison) => (
      <Link href={`/comparacoes/${encodeURIComponent(comparison.comparisonId)}`} className={textLinkClassName()}>
        {comparison.title}
      </Link>
    ),
  },
  { key: 'subject', header: header.subject, render: (comparison) => <span className="mono">{subjectText(comparison.subject, t)}</span> },
  {
    key: 'status',
    header: header.status,
    render: (comparison) => <Badge tone={comparisonStatusTones[comparison.status]}>{texts.statuses[comparison.status]}</Badge>,
  },
  { key: 'cost', header: header.cost, align: 'end', render: (comparison) => formatUsd(comparison.pairCostUsd, locale) },
  { key: 'created', header: header.created, render: (comparison) => formatDateTime(comparison.createdAt, locale) },
  ];
}

/** SPEC 0003 section 5.3: `/comparacoes`, newest first, paged by comparison id cursor. */
export default async function ComparisonsPage({ searchParams }: ComparisonsPageProps) {
  const query = await searchParams;
  const cursor = typeof query.cursor === 'string' && ComparisonIdSchema.safeParse(query.cursor).success ? query.cursor : undefined;
  const page = await serverComparisonsApi().listComparisons({ limit: PAGE_SIZE, cursor });
  const { t, locale } = await getI18n();
  const texts = t.curations.comparisons.list;
  const newComparisonLink = (
    <Link href="/comparacoes/nova" className={buttonClassName({ variant: 'primary' })}>
      {texts.newComparison}
    </Link>
  );

  return (
    <div className={layout.page}>
      <PageHeader
        title={texts.title}
        description={texts.description}
        actions={newComparisonLink}
      />
      {page.items.length === 0 && cursor === undefined ? (
        <EmptyState
          title={texts.emptyTitle}
          description={texts.emptyDescription}
          action={newComparisonLink}
        />
      ) : (
        <>
          <Table
            caption={texts.title}
            hideCaption
            columns={comparisonColumns(t, locale)}
            rows={page.items}
            rowKey={(comparison) => comparison.comparisonId}
            emptyText={texts.tableEmpty}
          />
          {page.nextCursor !== null && (
            <Link href={`/comparacoes?cursor=${encodeURIComponent(page.nextCursor)}`} className={textLinkClassName()}>
              {texts.older}
            </Link>
          )}
        </>
      )}
      <RunListAutoRefresh active={page.items.some((comparison) => comparison.status === 'running')} />
    </div>
  );
}
