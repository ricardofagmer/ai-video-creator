import { EmptyState, PageHeader, StatusBadge, Table, buttonClassName, formatUsd, textLinkClassName, type TableColumn } from '@studio/ui';
import { type RunIndexEntryView } from '@studio/shared/api';
import { RunIdSchema } from '@studio/shared/run-format';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { stageLabels } from '@/features/recipes/recipe-labels';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime, isLiveStatus, stepLabels } from '@/features/runs/run-labels';
import { serverRunsApi } from '@/features/runs/runs-api.server';

export const metadata: Metadata = { title: 'Execuções' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface RunsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** "Etapa atual" from the row's `cursor` (SPEC 0002 rev 4, A22): stage · step, or a dash when null. */
function currentStageText(cursor: RunIndexEntryView['cursor']): string {
  return cursor === null ? '—' : `${stageLabels[cursor.stageId]} · ${stepLabels[cursor.step]}`;
}

const columns: readonly TableColumn<RunIndexEntryView>[] = [
  {
    key: 'run',
    header: 'Execução',
    rowHeader: true,
    render: (entry) => (
      <Link href={`/execucoes/${entry.runId}`} className={textLinkClassName()}>
        <span className="mono">{entry.runId}</span>
      </Link>
    ),
  },
  { key: 'recipe', header: 'Receita', render: (entry) => <span className="mono">{entry.recipe.ref}</span> },
  { key: 'status', header: 'Status', render: (entry) => <StatusBadge kind="run" status={entry.status} /> },
  { key: 'stage', header: 'Etapa atual', render: (entry) => currentStageText(entry.cursor) },
  { key: 'cost', header: 'Custo', align: 'end', render: (entry) => formatUsd(entry.costUsd) },
  { key: 'started', header: 'Início', render: (entry) => formatDateTime(entry.createdAt) },
];

const newRunLink = (
  <Link href="/execucoes/nova" className={buttonClassName({ variant: 'primary' })}>
    Nova execução
  </Link>
);

/** design/telas/07: `/execucoes`, newest first, paged by run id cursor. */
export default async function RunsPage({ searchParams }: RunsPageProps) {
  const query = await searchParams;
  const cursor = typeof query.cursor === 'string' && RunIdSchema.safeParse(query.cursor).success ? query.cursor : undefined;
  const page = await serverRunsApi().listRuns({ limit: PAGE_SIZE, cursor });

  return (
    <div className={layout.page}>
      <PageHeader title="Execuções" description="Vídeos em produção e já entregues." actions={newRunLink} />
      {page.items.length === 0 && cursor === undefined ? (
        <EmptyState title="Nenhuma execução ainda" description="Escolha uma receita e inicie a primeira execução." action={newRunLink} />
      ) : (
        <>
          <Table caption="Execuções" hideCaption columns={columns} rows={page.items} rowKey={(entry) => entry.runId} emptyText="Nenhuma execução ainda." />
          {page.nextCursor !== null && (
            <Link href={`/execucoes?cursor=${encodeURIComponent(page.nextCursor)}`} className={textLinkClassName()}>
              Ver execuções mais antigas
            </Link>
          )}
        </>
      )}
      <RunListAutoRefresh active={page.items.some((entry) => isLiveStatus(entry.status))} />
    </div>
  );
}
