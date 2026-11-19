'use client';

import { Alert, Button, Dialog, FormField, Textarea } from '@studio/ui';
import { curationBounds } from '@studio/shared/curation';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { browserCurationsApi } from '../curations-api';
import styles from '../curations.module.css';

interface CurationDecisionActionsProps {
  curationId: string;
}

type PendingAction = 'save-draft' | 'decline' | null;

const DECLINE_REASON_ID = 'curadoria-motivo-recusa';

/**
 * "Salvar como rascunho" and "Recusar" (SPEC 0005 sections 5.7 and 5.9) for a `proposed` curation
 * the owner has not decided. Saving creates a new `draft` version with provenance `curator`;
 * nothing here activates or promotes a version (AC 35, C5-AC-03).
 */
export function CurationDecisionActions({ curationId }: CurationDecisionActionsProps): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function saveDraft(): Promise<void> {
    if (pending !== null) return;
    setError(null);
    setPending('save-draft');
    try {
      await browserCurationsApi.decide(curationId, { action: 'save-draft' });
      // The controls stay disabled until the refresh replaces them: the curation is decided.
      router.refresh();
    } catch (failure) {
      setError(describeApiError(failure));
      setPending(null);
    }
  }

  async function decline(): Promise<void> {
    if (pending !== null) return;
    const trimmed = reason.trim();
    if (trimmed.length > curationBounds.declineReasonChars) {
      setReasonError(`Use até ${curationBounds.declineReasonChars} caracteres.`);
      document.getElementById(DECLINE_REASON_ID)?.focus();
      return;
    }
    setReasonError(null);
    setError(null);
    setPending('decline');
    try {
      await browserCurationsApi.decide(curationId, { action: 'decline', reason: trimmed === '' ? undefined : trimmed });
      setDeclineOpen(false);
      router.refresh();
    } catch (failure) {
      setError(describeApiError(failure));
      setDeclineOpen(false);
      setPending(null);
    }
  }

  function closeDecline(): void {
    if (pending === null) setDeclineOpen(false);
  }

  return (
    <div className={layout.stack}>
      {error !== null && <Alert variant="error">{error}</Alert>}
      <p className="caption">
        Salvar cria uma versão nova em rascunho com o texto proposto. A versão atual não muda; para ativar a nova, abra a página dela.
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={pending === 'save-draft'}
          loadingLabel="Salvando…"
          disabled={pending !== null}
          onClick={() => void saveDraft()}
        >
          Salvar como rascunho
        </Button>
        <Button variant="secondary" disabled={pending !== null} onClick={() => setDeclineOpen(true)}>
          Recusar
        </Button>
      </div>
      <Dialog
        open={declineOpen}
        onClose={closeDecline}
        title="Recusar a proposta?"
        description="Nenhuma versão é criada. O motivo, se você escrever um, ajuda o curador nas próximas propostas para esta versão."
        footer={
          <>
            <Button variant="secondary" disabled={pending !== null} onClick={closeDecline}>
              Cancelar
            </Button>
            <Button variant="primary" loading={pending === 'decline'} loadingLabel="Recusando…" onClick={() => void decline()}>
              Recusar a proposta
            </Button>
          </>
        }
      >
        <FormField
          id={DECLINE_REASON_ID}
          label="Motivo"
          optional
          help={`${reason.trim().length} de ${curationBounds.declineReasonChars} caracteres. Não escreva senhas nem chaves.`}
          error={reasonError ?? undefined}
          disabled={pending !== null}
        >
          {({ invalid, ...control }) => (
            <Textarea
              {...control}
              invalid={invalid}
              rows={3}
              maxLength={curationBounds.declineReasonChars}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          )}
        </FormField>
      </Dialog>
    </div>
  );
}
