import { Card, DescriptionList, StatusBadge, formatUsd, textLinkClassName, type DescriptionItem, type Locale, type VideoAspect } from '@studio/ui';
import { type ComparisonArmView } from '@studio/shared/api';
import { type ComparisonSubject } from '@studio/shared/run-format';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { qualityScoreText } from '@/features/quality/quality-labels';
import { formatDuration } from '@/features/runs/run-labels';
import { type WebMessages } from '@/messages';
import { comparedVersionHref, decisionText, finishedRunStatuses, qaText, reviewerScoresText } from '../comparison-labels';
import styles from '../comparisons.module.css';
import { ComparisonArmPlayer } from './ComparisonArmPlayer';

interface ComparisonArmColumnProps {
  comparisonId: string;
  subject: ComparisonSubject;
  arm: ComparisonArmView;
  rejectedHasVideo: boolean;
  aspect: VideoAspect;
  t: WebMessages;
  locale: Locale;
}

function runItems(arm: ComparisonArmView, t: WebMessages, locale: Locale): DescriptionItem[] {
  const texts = t.curations.comparisons;
  const terms = texts.arm;
  const reviewable = finishedRunStatuses.includes(arm.status);
  return [
    { term: terms.status, description: <StatusBadge kind="run" status={arm.status} /> },
    {
      term: terms.run,
      description: (
        <Link href={`/execucoes/${encodeURIComponent(arm.runId)}`} className={textLinkClassName()}>
          <span className="mono">{arm.runId}</span>
        </Link>
      ),
    },
    {
      term: terms.review,
      description: reviewable ? (
        <Link href={`/execucoes/${encodeURIComponent(arm.runId)}/revisao`} className={textLinkClassName()}>
          {terms.openReview}
        </Link>
      ) : (
        terms.notAvailable
      ),
    },
    { term: terms.recipe, description: arm.recipe.ref, mono: true },
    {
      term: terms.score,
      // A rev 4 producer omits the platform count (R3-AC-07); it then reads as unknown.
      description:
        arm.comparedVersionScore === null
          ? `${t.catalog.qualityText.noScore} (${t.catalog.qualityText.noRuns})`
          : qualityScoreText(
              {
                ...arm.comparedVersionScore,
                qualityPlatformSampleSize: arm.comparedVersionScore.qualityPlatformSampleSize ?? null,
              },
              t.catalog.qualityText,
              locale,
            ),
    },
    { term: terms.qa, description: qaText(arm.qa, texts) },
    { term: terms.reviewerScores, description: reviewerScoresText(arm.reviewerScores, t, locale) },
    { term: terms.decision, description: decisionText(arm.decision, texts) },
    { term: terms.cost, description: formatUsd(arm.costUsd, locale) },
    { term: terms.duration, description: formatDuration(arm.durationMs) },
    { term: terms.recoveries, description: texts.recoveries(arm.recoveries) },
  ];
}

/**
 * One side of `/comparacoes/[comparisonId]` (SPEC 0003 section 5.3): the version this arm ran, its
 * run with status, QA, reviewer scores, decision, cost and the compared version's score, and its
 * video. The only way forward from here is a link to the version page; nothing here changes a
 * version's status.
 */
export function ComparisonArmColumn({ comparisonId, subject, arm, rejectedHasVideo, aspect, t, locale }: ComparisonArmColumnProps): ReactElement {
  const versionHref = comparedVersionHref(subject, arm.comparedRef, comparisonId);
  return (
    <Card
      title={t.curations.comparisons.arms[arm.arm]}
      description={<span className={`mono ${styles.refLine}`}>{arm.comparedRef}</span>}
      actions={
        versionHref === null ? undefined : (
          <Link href={versionHref} className={textLinkClassName()}>
            {t.curations.comparisons.arm.openVersion}
          </Link>
        )
      }
    >
      <div className={layout.stack}>
        <ComparisonArmPlayer arm={arm} rejectedHasVideo={rejectedHasVideo} aspect={aspect} t={t} />
        <DescriptionList items={runItems(arm, t, locale)} />
      </div>
    </Card>
  );
}
