'use client';

import type { ReactElement, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Alert } from '../alert/Alert';

export interface WaitingNoticeProps {
  /** Why the run stopped, for example "A estimativa passa do limite de custo por execução." */
  reason: ReactNode;
  /** The "what to do" text the engine wrote for this gate. */
  whatToDo: ReactNode;
  /** Gate answers, for example "Aprovar plano" / "Recusar". */
  actions?: ReactNode;
  className?: string;
}

/** The "Aguardando você" state of a run in `waiting` (PRD 7.3, criterion 16). */
export function WaitingNotice({ reason, whatToDo, actions, className }: WaitingNoticeProps): ReactElement {
  const { ui } = useI18n();
  return (
    <Alert variant="warning" title={ui.runs.waitingTitle} actions={actions} className={className}>
      <p>{reason}</p>
      <p>
        <strong>{ui.runs.whatToDo}</strong>
        {whatToDo}
      </p>
    </Alert>
  );
}
