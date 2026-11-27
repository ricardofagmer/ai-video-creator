import { EmptyState, buttonClassName, textLinkClassName } from '@studio/ui';
import { ComparisonIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { serverComparisonsApi } from '@/features/comparisons/comparisons-api.server';
import { ComparisonList } from '@/features/comparisons/components/ComparisonList';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.curations.comparisons.list.title };
}
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface ComparisonsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      <StudioHero
        eyebrow={t.common.heroEyebrows.comparisons}
        glyph="compare"
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
          {page.items.length === 0 ? <p>{texts.tableEmpty}</p> : <ComparisonList comparisons={page.items} t={t} locale={locale} />}
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
