import { Card, DescriptionList, StatusBadge, formatUsd, textLinkClassName, type DescriptionItem, type VideoAspect } from '@studio/ui';
import { type ComparisonArmView } from '@studio/shared/api';
import { type ComparisonSubject } from '@studio/shared/run-format';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { qualityScoreText } from '@/features/quality/quality-labels';
import { formatDuration } from '@/features/runs/run-labels';
import {
  armLabels,
  comparedVersionHref,
  decisionText,
  finishedRunStatuses,
  qaText,
  recoveriesText,
  reviewerScoresText,
} from '../comparison-labels';
import styles from '../comparisons.module.css';
import { ComparisonArmPlayer } from './ComparisonArmPlayer';

interface ComparisonArmColumnProps {
  comparisonId: string;
  subject: ComparisonSubject;
  arm: ComparisonArmView;
  rejectedHasVideo: boolean;
  aspect: VideoAspect;
}

function runItems(arm: ComparisonArmView): DescriptionItem[] {
  const reviewable = finishedRunStatuses.includes(arm.status);
  return [
    { term: 'Status', description: <StatusBadge kind="run" status={arm.status} /> },
    {
      term: 'Execução',
      description: (
        <Link href={`/execucoes/${encodeURIComponent(arm.runId)}`} className={textLinkClassName()}>
          <span className="mono">{arm.runId}</span>
        </Link>
      ),
    },
    {
      term: 'Revisão',
      description: reviewable ? (
        <Link href={`/execucoes/${encodeURIComponent(arm.runId)}/revisao`} className={textLinkClassName()}>
          Abrir a revisão
        </Link>
      ) : (
        'Ainda não disponível'
      ),
    },
    { term: 'Receita executada', description: arm.recipe.ref, mono: true },
    {
      term: 'Nota da versão comparada',
      // C10 `comparedVersionScore` carries no platform count (rev 3 shape), so none is shown.
      description:
        arm.comparedVersionScore === null
          ? 'sem nota (sem execuções)'
          : qualityScoreText({ ...arm.comparedVersionScore, qualityPlatformSampleSize: null }),
    },
    { term: 'QA', description: qaText(arm.qa) },
    { term: 'Notas do revisor', description: reviewerScoresText(arm.reviewerScores) },
    { term: 'Decisão', description: decisionText(arm.decision) },
    { term: 'Custo', description: formatUsd(arm.costUsd) },
    { term: 'Duração', description: formatDuration(arm.durationMs) },
    { term: 'Recuperações', description: recoveriesText(arm.recoveries) },
  ];
}

/**
 * One side of `/comparacoes/[comparisonId]` (SPEC 0003 section 5.3): the version this arm ran, its
 * run with status, QA, reviewer scores, decision, cost and the compared version's score, and its
 * video. The only way forward from here is a link to the version page; nothing here changes a
 * version's status.
 */
export function ComparisonArmColumn({ comparisonId, subject, arm, rejectedHasVideo, aspect }: ComparisonArmColumnProps): ReactElement {
  const versionHref = comparedVersionHref(subject, arm.comparedRef, comparisonId);
  return (
    <Card
      title={armLabels[arm.arm]}
      description={<span className={`mono ${styles.refLine}`}>{arm.comparedRef}</span>}
      actions={
        versionHref === null ? undefined : (
          <Link href={versionHref} className={textLinkClassName()}>
            Abrir esta versão
          </Link>
        )
      }
    >
      <div className={layout.stack}>
        <ComparisonArmPlayer arm={arm} rejectedHasVideo={rejectedHasVideo} aspect={aspect} />
        <DescriptionList items={runItems(arm)} />
      </div>
    </Card>
  );
}
