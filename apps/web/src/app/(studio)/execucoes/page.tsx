import { EmptyState, buttonClassName, textLinkClassName } from '@studio/ui';
import { RunIdSchema } from '@studio/shared/run-format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { RunList } from '@/features/runs/components/RunList';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { isLiveStatus } from '@/features/runs/run-labels';
import { serverRunsApi } from '@/features/runs/runs-api.server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.runs.list.title };
}
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface RunsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** design/telas/07: `/execucoes`, newest first, paged by run id cursor. */
export default async function RunsPage({ searchParams }: RunsPageProps) {
  const query = await searchParams;
  const cursor = typeof query.cursor === 'string' && RunIdSchema.safeParse(query.cursor).success ? query.cursor : undefined;
  const page = await serverRunsApi().listRuns({ limit: PAGE_SIZE, cursor });
  const { t, locale } = await getI18n();
  const liveCount = page.items.filter((entry) => isLiveStatus(entry.status)).length;
  const newRunLink = (
    <Link href="/execucoes/nova" className={buttonClassName({ variant: 'primary' })}>
      {t.runs.list.newRun}
    </Link>
  );
  const facts = page.items.length === 0 ? [] : [t.runs.list.count(page.items.length), ...(liveCount > 0 ? [t.runs.list.liveCount(liveCount)] : [])];

  return (
    <div className={layout.page}>
      <StudioHero
        eyebrow={t.common.heroEyebrows.runs}
        glyph="reel"
        title={t.runs.list.title}
        description={t.runs.list.description}
        facts={facts}
        actions={newRunLink}
      />
      {page.items.length === 0 && cursor === undefined ? (
        <EmptyState title={t.runs.list.emptyTitle} description={t.runs.list.emptyDescription} action={newRunLink} />
      ) : (
        <>
          {page.items.length === 0 ? <p>{t.runs.list.tableEmpty}</p> : <RunList entries={page.items} t={t.runs} locale={locale} />}
          {page.nextCursor !== null && (
            <Link href={`/execucoes?cursor=${encodeURIComponent(page.nextCursor)}`} className={textLinkClassName()}>
              {t.runs.list.olderRuns}
            </Link>
          )}
        </>
      )}
      <RunListAutoRefresh active={liveCount > 0} />
    </div>
  );
}
