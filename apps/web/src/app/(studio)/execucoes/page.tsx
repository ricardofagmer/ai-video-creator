import { EmptyState, PageHeader, StatusBadge, Table, buttonClassName, formatUsd, textLinkClassName, type Locale, type TableColumn } from '@studio/ui';
import { type RunIndexEntryView } from '@studio/shared/api';
import { RunIdSchema } from '@studio/shared/run-format';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime, isLiveStatus } from '@/features/runs/run-labels';
import { serverRunsApi } from '@/features/runs/runs-api.server';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.runs.list.title };
}
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface RunsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** "Etapa atual" from the row's `cursor` (SPEC 0002 rev 4, A22): stage · step, or a dash when null. */
function currentStageText(cursor: RunIndexEntryView['cursor'], runs: WebMessages['runs']): string {
  return cursor === null ? '—' : `${runs.stages[cursor.stageId]} · ${runs.steps[cursor.step]}`;
}

function runColumns(runs: WebMessages['runs'], locale: Locale): readonly TableColumn<RunIndexEntryView>[] {
  const columns = runs.list.columns;
  return [
    {
      key: 'run',
      header: columns.run,
      rowHeader: true,
      render: (entry) => (
        <Link href={`/execucoes/${entry.runId}`} className={textLinkClassName()}>
          <span className="mono">{entry.runId}</span>
        </Link>
      ),
    },
    { key: 'recipe', header: columns.recipe, render: (entry) => <span className="mono">{entry.recipe.ref}</span> },
    { key: 'status', header: columns.status, render: (entry) => <StatusBadge kind="run" status={entry.status} /> },
    { key: 'stage', header: columns.stage, render: (entry) => currentStageText(entry.cursor, runs) },
    { key: 'cost', header: columns.cost, align: 'end', render: (entry) => formatUsd(entry.costUsd, locale) },
    { key: 'started', header: columns.started, render: (entry) => formatDateTime(entry.createdAt, locale) },
  ];
}

/** design/telas/07: `/execucoes`, newest first, paged by run id cursor. */
export default async function RunsPage({ searchParams }: RunsPageProps) {
  const query = await searchParams;
  const cursor = typeof query.cursor === 'string' && RunIdSchema.safeParse(query.cursor).success ? query.cursor : undefined;
  const page = await serverRunsApi().listRuns({ limit: PAGE_SIZE, cursor });
  const { t, locale } = await getI18n();
  const columns = runColumns(t.runs, locale);
  const newRunLink = (
    <Link href="/execucoes/nova" className={buttonClassName({ variant: 'primary' })}>
      {t.runs.list.newRun}
    </Link>
  );

  return (
    <div className={layout.page}>
      <PageHeader title={t.runs.list.title} description={t.runs.list.description} actions={newRunLink} />
      {page.items.length === 0 && cursor === undefined ? (
        <EmptyState title={t.runs.list.emptyTitle} description={t.runs.list.emptyDescription} action={newRunLink} />
      ) : (
        <>
          <Table caption={t.runs.list.title} hideCaption columns={columns} rows={page.items} rowKey={(entry) => entry.runId} emptyText={t.runs.list.tableEmpty} />
          {page.nextCursor !== null && (
            <Link href={`/execucoes?cursor=${encodeURIComponent(page.nextCursor)}`} className={textLinkClassName()}>
              {t.runs.list.olderRuns}
            </Link>
          )}
        </>
      )}
      <RunListAutoRefresh active={page.items.some((entry) => isLiveStatus(entry.status))} />
    </div>
  );
}
