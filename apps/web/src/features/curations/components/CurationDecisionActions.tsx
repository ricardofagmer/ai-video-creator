'use client';

import { Alert, Button, Dialog, FormField, Textarea } from '@studio/ui';
import { curationBounds } from '@studio/shared/curation';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
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
  const t = useWebMessages();
  const texts = t.curations.decisionActions;
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
      setError(describeApiError(failure, t));
      setPending(null);
    }
  }

  async function decline(): Promise<void> {
    if (pending !== null) return;
    const trimmed = reason.trim();
    if (trimmed.length > curationBounds.declineReasonChars) {
      setReasonError(texts.reasonTooLong(curationBounds.declineReasonChars));
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
      setError(describeApiError(failure, t));
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
        {texts.saveHelp}
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={pending === 'save-draft'}
          loadingLabel={texts.saving}
          disabled={pending !== null}
          onClick={() => void saveDraft()}
        >
          {texts.saveDraft}
        </Button>
        <Button variant="secondary" disabled={pending !== null} onClick={() => setDeclineOpen(true)}>
          {texts.decline}
        </Button>
      </div>
      <Dialog
        open={declineOpen}
        onClose={closeDecline}
        title={texts.declineTitle}
        description={texts.declineDescription}
        footer={
          <>
            <Button variant="secondary" disabled={pending !== null} onClick={closeDecline}>
              {texts.cancel}
            </Button>
            <Button variant="primary" loading={pending === 'decline'} loadingLabel={texts.declining} onClick={() => void decline()}>
              {texts.declineConfirm}
            </Button>
          </>
        }
      >
        <FormField
          id={DECLINE_REASON_ID}
          label={texts.reason}
          optional
          help={texts.reasonHelp(reason.trim().length, curationBounds.declineReasonChars)}
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
