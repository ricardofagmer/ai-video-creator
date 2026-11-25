import { Badge, formatUsd, type Locale } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { PosterCard } from '@/features/common/components/PosterCard';
import layout from '@/features/common/layout.module.css';
import poster from '@/features/common/poster-card.module.css';
import { studioToneOf } from '@/features/common/studio-artwork';
import { formatDateTime } from '@/features/runs/run-labels';
import { type WebMessages } from '@/messages';
import { comparisonStatusTones, subjectText } from '../comparison-labels';
import styles from '../comparisons.module.css';

interface ComparisonCardProps {
  comparison: ComparisonView;
  t: WebMessages;
  locale: Locale;
}

/** One comparison poster: title, status, what changes, the pair's cost and when it was created. The whole card opens it. */
function ComparisonCard({ comparison, t, locale }: ComparisonCardProps): ReactElement {
  const texts = t.curations.comparisons;
  const labels = texts.list.columns;
  return (
    <PosterCard artwork={{ glyph: 'compare', tone: studioToneOf(comparison.comparisonId) }}>
      <h3 className={`heading-3 ${poster.name}`}>
        <Link href={`/comparacoes/${encodeURIComponent(comparison.comparisonId)}`} className={poster.cardLink}>
          {comparison.title}
        </Link>
      </h3>
      <p className={poster.meta}>
        <Badge tone={comparisonStatusTones[comparison.status]}>{texts.statuses[comparison.status]}</Badge>
      </p>
      <p className={poster.excerpt}>
        {labels.subject}: <span className="mono">{subjectText(comparison.subject, t)}</span>
      </p>
      <dl className={styles.posterFacts}>
        <div>
          <dt className="caption">{labels.cost}</dt>
          <dd>{formatUsd(comparison.pairCostUsd, locale)}</dd>
        </div>
        <div>
          <dt className="caption">{labels.created}</dt>
          <dd>{formatDateTime(comparison.createdAt, locale)}</dd>
        </div>
      </dl>
    </PosterCard>
  );
}

/** SPEC 0003 section 5.3: the comparison posters of one page, newest first. */
export function ComparisonList({ comparisons, t, locale }: { comparisons: readonly ComparisonView[]; t: WebMessages; locale: Locale }): ReactElement {
  return (
    <ul className={layout.cardGrid}>
      {comparisons.map((comparison) => (
        <li key={comparison.comparisonId}>
          <ComparisonCard comparison={comparison} t={t} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
