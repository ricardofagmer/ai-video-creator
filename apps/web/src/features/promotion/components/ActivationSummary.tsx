'use client';

import { DescriptionList, textLinkClassName, useI18n, type DescriptionItem } from '@studio/ui';
import { type PromotionApprovalView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatDateTime } from '@/features/catalog/catalog-labels';
import { QualityScore } from '@/features/quality/components/QualityScore';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import styles from '../promotion.module.css';

interface ActivationSummaryProps {
  approval: PromotionApprovalView;
  /** Assets carry a score; recipes have none, so their snapshot is not shown. */
  showScore: boolean;
}

function evidenceItems(approval: PromotionApprovalView, t: WebMessages['catalog']['promotion']): DescriptionItem[] {
  const { comparisonId, runIds } = approval.evidence;
  const items: DescriptionItem[] = [];
  if (comparisonId !== null) {
    items.push({
      term: t.comparison,
      description: (
        <Link href={`/comparacoes/${comparisonId}`} className={textLinkClassName()}>
          <span className="mono">{comparisonId}</span>
        </Link>
      ),
    });
  }
  if (runIds.length > 0) {
    items.push({
      term: t.runs,
      description: (
        <ul className={styles.plainList}>
          {runIds.map((runId) => (
            <li key={runId}>
              <Link href={`/execucoes/${runId}`} className={textLinkClassName()}>
                <span className="mono">{runId}</span>
              </Link>
            </li>
          ))}
        </ul>
      ),
    });
  }
  return items;
}

/**
 * The recorded owner approval that made a version `active` (SPEC 0003 section 5.4, R2-AC-19). The
 * reason is owner text: it renders as text, keeping its line breaks, never as markup.
 */
export function ActivationSummary({ approval, showScore }: ActivationSummaryProps): ReactElement {
  const t = useWebMessages().catalog.promotion;
  const { locale } = useI18n();
  const items: DescriptionItem[] = [
    { term: t.approvedBy, description: approval.decidedBy },
    { term: t.approvedAt, description: formatDateTime(approval.decidedAt, locale) },
    {
      term: t.reason,
      description: approval.reason === '' ? t.noReason : <span className={styles.ownerText}>{approval.reason}</span>,
    },
    {
      term: t.replacedVersion,
      description: approval.replacedVersion === null ? t.noneActive : t.replaced(approval.replacedVersion),
    },
    ...(showScore
      ? [
          {
            term: t.scoreAtApproval,
            // Rev 5 freezes the platform count too (R3-AC-07); an approval recorded before that has none (null).
            description: (
              <QualityScore
                label={t.scoreLabel}
                qualityScore={approval.qualityScoreAtApproval}
                qualitySampleSize={approval.sampleSizeAtApproval}
                qualityPlatformSampleSize={approval.platformSampleSizeAtApproval ?? null}
              />
            ),
          },
        ]
      : []),
    ...evidenceItems(approval, t),
  ];
  return <DescriptionList items={items} columns={2} />;
}
