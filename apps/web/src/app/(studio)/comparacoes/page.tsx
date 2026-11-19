import { Badge, EmptyState, PageHeader, Table, buttonClassName, formatUsd, textLinkClassName, type TableColumn } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import { ComparisonIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { comparisonStatusLabels, comparisonStatusTones, subjectText } from '@/features/comparisons/comparison-labels';
import { serverComparisonsApi } from '@/features/comparisons/comparisons-api.server';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime } from '@/features/runs/run-labels';

export const metadata: Metadata = { title: 'Comparações' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface ComparisonsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const columns: readonly TableColumn<ComparisonView>[] = [
  {
    key: 'title',
    header: 'Comparação',
    rowHeader: true,
    render: (comparison) => (
      <Link href={`/comparacoes/${encodeURIComponent(comparison.comparisonId)}`} className={textLinkClassName()}>
        {comparison.title}
      </Link>
    ),
  },
  { key: 'subject', header: 'O que muda', render: (comparison) => <span className="mono">{subjectText(comparison.subject)}</span> },
  {
    key: 'status',
    header: 'Status',
    render: (comparison) => <Badge tone={comparisonStatusTones[comparison.status]}>{comparisonStatusLabels[comparison.status]}</Badge>,
  },
  { key: 'cost', header: 'Custo do par', align: 'end', render: (comparison) => formatUsd(comparison.pairCostUsd) },
  { key: 'created', header: 'Criada em', render: (comparison) => formatDateTime(comparison.createdAt) },
];

const newComparisonLink = (
  <Link href="/comparacoes/nova" className={buttonClassName({ variant: 'primary' })}>
    Nova comparação
  </Link>
);

/** SPEC 0003 section 5.3: `/comparacoes`, newest first, paged by comparison id cursor. */
export default async function ComparisonsPage({ searchParams }: ComparisonsPageProps) {
  const query = await searchParams;
  const cursor = typeof query.cursor === 'string' && ComparisonIdSchema.safeParse(query.cursor).success ? query.cursor : undefined;
  const page = await serverComparisonsApi().listComparisons({ limit: PAGE_SIZE, cursor });

  return (
    <div className={layout.page}>
      <PageHeader
        title="Comparações"
        description="Duas execuções do mesmo briefing, uma com cada versão, lado a lado."
        actions={newComparisonLink}
      />
      {page.items.length === 0 && cursor === undefined ? (
        <EmptyState
          title="Nenhuma comparação ainda"
          description="Compare uma versão nova de um ativo ou de uma receita com a atual antes de ativá-la."
          action={newComparisonLink}
        />
      ) : (
        <>
          <Table
            caption="Comparações"
            hideCaption
            columns={columns}
            rows={page.items}
            rowKey={(comparison) => comparison.comparisonId}
            emptyText="Nenhuma comparação ainda."
          />
          {page.nextCursor !== null && (
            <Link href={`/comparacoes?cursor=${encodeURIComponent(page.nextCursor)}`} className={textLinkClassName()}>
              Ver comparações mais antigas
            </Link>
          )}
        </>
      )}
      <RunListAutoRefresh active={page.items.some((comparison) => comparison.status === 'running')} />
    </div>
  );
}
