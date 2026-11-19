'use client';

import { Alert, Button, Dialog, formatUsd } from '@studio/ui';
import { type ComparisonEstimate } from '@studio/shared/api';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { ApiRequestError } from '@/lib/api';
import { browserComparisonsApi } from '../comparisons-api';

interface StartComparisonButtonProps {
  comparisonId: string;
  estimate: ComparisonEstimate;
}

const BLOCKED_REASON_ID = 'comparacao-inicio-bloqueado';

/** Why the pair cannot start, before any request: the gate fails closed (SPEC 0003 B20). */
function blockedReason(estimate: ComparisonEstimate): string | null {
  if (estimate.monthToDateUsd === null) {
    return 'O gasto do mês não pôde ser lido, então a comparação não pode ser iniciada agora. Verifique com `studio doctor`.';
  }
  if (!estimate.withinMonthCeiling) return 'As duas execuções passariam do teto de gasto do mês.';
  return null;
}

/**
 * "Iniciar comparação" (SPEC 0003 section 5.3, R2-AC-22): shows the pair's worst case and, on
 * confirmation, sends exactly that `pairWorstCaseUsd` as `acceptedWorstCaseUsd`. When the api
 * recomputed a different amount (409 `comparison-estimate-changed`) the page reloads so the owner
 * sees and confirms the new one; nothing starts on a refusal.
 */
export function StartComparisonButton({ comparisonId, estimate }: StartComparisonButtonProps): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accepted = estimate.pairWorstCaseUsd;
  const blocked = blockedReason(estimate);

  async function start(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await browserComparisonsApi.startComparison(comparisonId, { acceptedWorstCaseUsd: accepted });
      setOpen(false);
      router.refresh();
    } catch (failure) {
      setError(describeApiError(failure));
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
          {`Iniciar as duas execuções (até ${formatUsd(accepted)})`}
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        role="alertdialog"
        title="Iniciar a comparação?"
        description={`As duas execuções começam juntas. O custo máximo do par é ${formatUsd(accepted)}; você aceita esse valor ao iniciar.`}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={pending} loadingLabel="Iniciando…" onClick={() => void start()}>
              {`Aceitar ${formatUsd(accepted)} e iniciar`}
            </Button>
          </>
        }
      />
    </div>
  );
}
