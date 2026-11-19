import { Alert, Badge, DescriptionList } from '@studio/ui';
import { type ChecklistItem } from '@studio/shared/recipes';
import { type GateDecision } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatDateTime } from '@/features/runs/run-labels';
import styles from '../review.module.css';

type FinalDecision = Extract<GateDecision, { kind: 'final' }>;

interface ReviewDecisionSummaryProps {
  decision: FinalDecision;
  checklist: readonly ChecklistItem[];
}

/**
 * Card "Sua revisão" after the decision (design/telas/09 step 4): read only, no publish action.
 * Notes are owner text shown as React text with their line breaks.
 */
export function ReviewDecisionSummary({ decision, checklist }: ReviewDecisionSummaryProps): ReactElement {
  const decidedAt = formatDateTime(decision.decidedAt);
  const answers = new Map(decision.checklist.map((answer) => [answer.itemId, answer.checked]));
  return (
    <div className={layout.stack}>
      {decision.outcome === 'approved' ? (
        <Alert variant="success">{`Vídeo aprovado em ${decidedAt}.`}</Alert>
      ) : (
        <Alert variant="info">{`Vídeo rejeitado em ${decidedAt}.`}</Alert>
      )}
      <DescriptionList
        items={[
          { term: 'Nota', description: `${decision.rating} de 5` },
          { term: 'Notas', description: decision.notes === '' ? '—' : <span className={styles.notes}>{decision.notes}</span> },
          { term: 'Decidido por', description: decision.decidedBy },
        ]}
      />
      {checklist.length > 0 && (
        <ul className={styles.checklistSummary} aria-label="Checklist de publicação">
          {checklist.map((item) => {
            const marked = answers.get(item.id) === true;
            return (
              <li key={item.id}>
                <span className="body-sm">{item.label}</span>
                <Badge tone={marked ? 'success' : 'neutral'}>{marked ? 'Marcado' : 'Não marcado'}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
