import { DescriptionList, textLinkClassName, type DescriptionItem } from '@studio/ui';
import { type PromotionApprovalView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatDateTime } from '@/features/catalog/catalog-labels';
import { QualityScore } from '@/features/quality/components/QualityScore';
import styles from '../promotion.module.css';

interface ActivationSummaryProps {
  approval: PromotionApprovalView;
  /** Assets carry a score; recipes have none, so their snapshot is not shown. */
  showScore: boolean;
}

function evidenceItems(approval: PromotionApprovalView): DescriptionItem[] {
  const { comparisonId, runIds } = approval.evidence;
  const items: DescriptionItem[] = [];
  if (comparisonId !== null) {
    items.push({
      term: 'Comparação',
      description: (
        <Link href={`/comparacoes/${comparisonId}`} className={textLinkClassName()}>
          <span className="mono">{comparisonId}</span>
        </Link>
      ),
    });
  }
  if (runIds.length > 0) {
    items.push({
      term: 'Execuções',
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
  const items: DescriptionItem[] = [
    { term: 'Aprovada por', description: approval.decidedBy },
    { term: 'Aprovada em', description: formatDateTime(approval.decidedAt) },
    {
      term: 'Motivo',
      description: approval.reason === '' ? 'Sem motivo informado.' : <span className={styles.ownerText}>{approval.reason}</span>,
    },
    {
      term: 'Versão substituída',
      description: approval.replacedVersion === null ? 'Nenhuma versão estava ativa.' : `v${approval.replacedVersion}, agora descontinuada`,
    },
    ...(showScore
      ? [
          {
            term: 'Nota na aprovação',
            // The C10 approval freezes the score and the run count only (SPEC 0003); no platform count exists to show.
            description: (
              <QualityScore
                label="Nota"
                qualityScore={approval.qualityScoreAtApproval}
                qualitySampleSize={approval.sampleSizeAtApproval}
                qualityPlatformSampleSize={null}
              />
            ),
          },
        ]
      : []),
    ...evidenceItems(approval),
  ];
  return <DescriptionList items={items} columns={2} />;
}
