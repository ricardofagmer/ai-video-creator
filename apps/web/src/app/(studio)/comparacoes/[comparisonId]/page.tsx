import { Alert, Badge, EmptyState, buttonClassName, textLinkClassName } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import { ComparisonIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { comparisonStatusTones, subjectText, verificationWarnings } from '@/features/comparisons/comparison-labels';
import { loadArmAspects, loadComparison } from '@/features/comparisons/comparison-page.server';
import styles from '@/features/comparisons/comparisons.module.css';
import { ComparisonArmColumn } from '@/features/comparisons/components/ComparisonArmColumn';
import { ComparisonCostCard } from '@/features/comparisons/components/ComparisonCostCard';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime } from '@/features/runs/run-labels';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export const dynamic = 'force-dynamic';

interface ComparisonPageProps {
  params: Promise<{ comparisonId: string }>;
}

async function readComparison(comparisonId: string): Promise<ComparisonView | null> {
  return ComparisonIdSchema.safeParse(comparisonId).success ? loadComparison(comparisonId) : null;
}

export async function generateMetadata({ params }: ComparisonPageProps): Promise<Metadata> {
  const { comparisonId } = await params;
  const comparison = await readComparison(comparisonId);
  const { t } = await getI18n();
  const texts = t.curations.comparisons;
  return { title: comparison === null ? texts.list.title : texts.detail.titleOf(comparison.title) };
}

function StatusNotice({ comparison, t }: { comparison: ComparisonView; t: WebMessages['curations']['comparisons']['detail'] }) {
  if (comparison.status === 'draft') {
    return <Alert variant="info">{t.draftNotice}</Alert>;
  }
  if (comparison.status === 'incomplete') {
    return <Alert variant="warning">{t.incompleteNotice}</Alert>;
  }
  if (comparison.status === 'ready') {
    return <Alert variant="info">{t.readyNotice}</Alert>;
  }
  return null;
}

/**
 * SPEC 0003 section 5.3: `/comparacoes/[comparisonId]`, both arms side by side with their status,
 * QA, reviewer scores, decision, cost and video, the pair's cost and the start control while both
 * runs are drafts. No control here changes a version's status (R2-AC-22): the arm cards link to
 * the version pages, where the promotion dialog lives.
 */
export default async function ComparisonPage({ params }: ComparisonPageProps) {
  const { comparisonId } = await params;
  const comparison = await readComparison(comparisonId);
  const { t, locale } = await getI18n();
  const texts = t.curations.comparisons;

  if (comparison === null) {
    return (
      <EmptyState
        title={texts.detail.notFoundTitle}
        description={texts.detail.notFoundDescription}
        action={
          <Link href="/comparacoes" className={buttonClassName({ variant: 'secondary' })}>
            {texts.detail.backToList}
          </Link>
        }
      />
    );
  }

  const aspects = await loadArmAspects(comparison);
  const warnings = verificationWarnings(comparison.verified, texts);
  const rejectedHasVideo = comparison.status === 'ready';

  return (
    <div className={layout.page}>
      <StudioHero
        variant="compact"
        eyebrow={t.common.heroEyebrows.comparisons}
        glyph="compare"
        back={
          <Link href="/comparacoes" className={textLinkClassName()}>
            {texts.new.back}
          </Link>
        }
        title={comparison.title}
        meta={<Badge tone={comparisonStatusTones[comparison.status]}>{texts.statuses[comparison.status]}</Badge>}
        description={
          <>
            <span className="mono">{subjectText(comparison.subject, t)}</span>
            {texts.detail.createdBy(comparison.createdBy, formatDateTime(comparison.createdAt, locale))}
          </>
        }
      />
      {warnings.length > 0 && (
        <Alert variant="warning" title={texts.detail.warningsTitle}>
          <ul className={styles.warningList}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}
      <StatusNotice comparison={comparison} t={texts.detail} />
      <div className={styles.arms}>
        <ComparisonArmColumn
          comparisonId={comparison.comparisonId}
          subject={comparison.subject}
          arm={comparison.arms.a}
          rejectedHasVideo={rejectedHasVideo}
          aspect={aspects.a}
          t={t}
          locale={locale}
        />
        <ComparisonArmColumn
          comparisonId={comparison.comparisonId}
          subject={comparison.subject}
          arm={comparison.arms.b}
          rejectedHasVideo={rejectedHasVideo}
          aspect={aspects.b}
          t={t}
          locale={locale}
        />
      </div>
      <ComparisonCostCard comparison={comparison} t={texts.cost} locale={locale} />
      <RunListAutoRefresh active={comparison.status === 'running'} />
    </div>
  );
}
