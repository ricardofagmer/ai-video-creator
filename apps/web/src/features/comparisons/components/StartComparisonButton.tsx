'use client';

import { Alert, Button, Dialog, formatUsd, useI18n } from '@studio/ui';
import { type ComparisonEstimate } from '@studio/shared/api';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import layout from '@/features/common/layout.module.css';
import { ApiRequestError } from '@/lib/api';
import { type WebMessages } from '@/messages';
import { browserComparisonsApi } from '../comparisons-api';

interface StartComparisonButtonProps {
  comparisonId: string;
  estimate: ComparisonEstimate;
}

const BLOCKED_REASON_ID = 'comparacao-inicio-bloqueado';

/** Why the pair cannot start, before any request: the gate fails closed (SPEC 0003 B20). */
function blockedReason(estimate: ComparisonEstimate, t: WebMessages['curations']['comparisons']['start']): string | null {
  if (estimate.monthToDateUsd === null) return t.monthUnreadable;
  if (!estimate.withinMonthCeiling) return t.overCeiling;
  return null;
}

/**
 * "Iniciar comparação" (SPEC 0003 section 5.3, R2-AC-22): shows the pair's worst case and, on
 * confirmation, sends exactly that `pairWorstCaseUsd` as `acceptedWorstCaseUsd`. When the api
 * recomputed a different amount (409 `comparison-estimate-changed`) the page reloads so the owner
 * sees and confirms the new one; nothing starts on a refusal.
 */
export function StartComparisonButton({ comparisonId, estimate }: StartComparisonButtonProps): ReactElement {
  const t = useWebMessages();
  const texts = t.curations.comparisons.start;
  const { locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accepted = estimate.pairWorstCaseUsd;
  const acceptedText = formatUsd(accepted, locale);
  const blocked = blockedReason(estimate, texts);

  async function start(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await browserComparisonsApi.startComparison(comparisonId, { acceptedWorstCaseUsd: accepted });
      setOpen(false);
      router.refresh();
    } catch (failure) {
      setError(describeApiError(failure, t));
      setOpen(false);
      if (failure instanceof ApiRequestError && failure.reason === 'comparison-estimate-changed') router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={layout.stack}>
      {error !== null && <Alert variant="error">{error}</Alert>}
      {blocked !== null && (
        <p id={BLOCKED_REASON_ID} className="caption">
          {blocked}
        </p>
      )}
      <div>
        <Button
          variant="primary"
          disabled={blocked !== null || pending}
          aria-describedby={blocked === null ? undefined : BLOCKED_REASON_ID}
          onClick={() => setOpen(true)}
        >
          {texts.button(acceptedText)}
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        role="alertdialog"
        title={texts.dialogTitle}
        description={texts.dialogDescription(acceptedText)}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              {texts.cancel}
            </Button>
            <Button variant="primary" loading={pending} loadingLabel={texts.starting} onClick={() => void start()}>
              {texts.accept(acceptedText)}
            </Button>
          </>
        }
      />
    </div>
  );
}
