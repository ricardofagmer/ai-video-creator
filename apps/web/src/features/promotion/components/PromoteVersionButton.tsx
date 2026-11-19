'use client';

import { Alert, Button, Checkbox, Dialog, FormField, Textarea } from '@studio/ui';
import { type PromoteVersionRequest, type PromotionApprovalView } from '@studio/shared/api';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { QualityScore } from '@/features/quality/components/QualityScore';
import { type QualityFigures } from '@/features/quality/quality-labels';
import { ApiRequestError } from '@/lib/api';
import { browserPromotionApi } from '../promotion-api';
import styles from '../promotion.module.css';
import { ActivationSummary } from './ActivationSummary';

/** The version the dialog would activate; the ref on screen is the `acknowledgeRef` sent. */
export type PromotionTarget =
  | { kind: 'asset'; assetId: string; version: number; quality: QualityFigures; activeLearnings: number }
  | { kind: 'recipe'; recipeId: string; version: number };

interface PromoteVersionButtonProps {
  target: PromotionTarget;
  disabled: boolean;
  /** Id of the element that explains why the button is disabled. */
  describedBy?: string;
  /** A comparison the owner came from (`?comparacao=`), offered as optional evidence. */
  evidenceComparisonId: string | null;
  /** Called after the owner closes the recorded approval; the page reloads its data. */
  onPromoted: () => void;
}

const REASON_MAX_CHARS = 1000;
const REASON_ID = 'promocao-motivo';
const ACKNOWLEDGE_ID = 'promocao-confirmacao';

function refOf(target: PromotionTarget): string {
  return target.kind === 'asset' ? `${target.assetId}@${target.version}` : `${target.recipeId}@${target.version}`;
}

function reasonRefused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.reason === 'invalid-promotion-input' && error.issues.some((issue) => issue.path === 'reason');
}

async function promote(target: PromotionTarget, request: PromoteVersionRequest): Promise<PromotionApprovalView> {
  if (target.kind === 'asset') {
    return (await browserPromotionApi.promoteAssetVersion(target.assetId, target.version, request)).approval;
  }
  return (await browserPromotionApi.promoteRecipeVersion(target.recipeId, target.version, request)).approval;
}

/**
 * "Ativar…" (SPEC 0003 section 5.4, R2-AC-19): replaces the R1 one-click "Ativar". The owner reads
 * the ref (and, for an asset, its score and notes count), may type a reason, confirms that exact
 * ref, and the web sends it as `acknowledgeRef` through `POST .../promotion`. The recorded approval
 * is shown before the dialog closes. Nothing here activates more than this one version.
 */
export function PromoteVersionButton({ target, disabled, describedBy, evidenceComparisonId, onPromoted }: PromoteVersionButtonProps): ReactElement {
  const ref = refOf(target);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [attachComparison, setAttachComparison] = useState(evidenceComparisonId !== null);
  const [fieldErrors, setFieldErrors] = useState<{ reason?: string; acknowledge?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [approval, setApproval] = useState<PromotionApprovalView | null>(null);

  function close(): void {
    if (pending) return;
    setOpen(false);
    if (approval !== null) onPromoted();
  }

  async function confirm(): Promise<void> {
    if (pending) return;
    if (!acknowledged) {
      setFieldErrors({ acknowledge: `Marque a confirmação para ativar ${ref}.` });
      document.getElementById(ACKNOWLEDGE_ID)?.focus();
      return;
    }
    setFieldErrors({});
    setServerError(null);
    setPending(true);
    try {
      const comparisonId = attachComparison && evidenceComparisonId !== null ? evidenceComparisonId : undefined;
      setApproval(
        await promote(target, {
          acknowledgeRef: ref,
          reason: reason.trim(),
          evidence: comparisonId === undefined ? undefined : { comparisonId },
        }),
      );
    } catch (error) {
      if (reasonRefused(error)) {
        setFieldErrors({ reason: 'O motivo não foi aceito: textos com aparência de senha ou chave são recusados.' });
        document.getElementById(REASON_ID)?.focus();
      } else {
        setServerError(describeApiError(error));
      }
    } finally {
      setPending(false);
    }
  }

  const footer =
    approval === null ? (
      <>
        <Button variant="secondary" disabled={pending} onClick={close}>
          Cancelar
        </Button>
        <Button variant="primary" loading={pending} loadingLabel="Ativando…" onClick={() => void confirm()}>
          {`Ativar ${ref}`}
        </Button>
      </>
    ) : (
      <Button variant="primary" onClick={close}>
        Concluir
      </Button>
    );

  return (
    <>
      <Button variant="primary" disabled={disabled} aria-describedby={describedBy} onClick={() => setOpen(true)}>
        Ativar…
      </Button>
      <Dialog
        open={open}
        onClose={close}
        role="alertdialog"
        title={approval === null ? `Ativar a versão v${target.version}?` : `Versão v${target.version} ativada`}
        description={
          approval === null
            ? 'A versão ativa atual, se houver, passa a descontinuada. A aprovação fica registrada com o seu nome e a data.'
            : 'Aprovação registrada. Ela fica visível na página da versão.'
        }
        footer={footer}
      >
        {approval !== null ? (
          <ActivationSummary approval={approval} showScore={target.kind === 'asset'} />
        ) : (
          <div className={layout.stack}>
            {serverError !== null && <Alert variant="error">{serverError}</Alert>}
            <p className={styles.refLine}>
              Versão: <span className="mono">{ref}</span>
            </p>
            {target.kind === 'asset' && (
              <p className={styles.refLine}>
                <QualityScore {...target.quality} />
                {` · ${target.activeLearnings === 1 ? '1 aprendizado ativo' : `${target.activeLearnings} aprendizados ativos`}`}
              </p>
            )}
            {evidenceComparisonId !== null && (
              <Checkbox
                id="promocao-evidencia"
                label="Registrar a comparação de origem como evidência"
                description={<span className="mono">{evidenceComparisonId}</span>}
                checked={attachComparison}
                disabled={pending}
                onChange={(event) => setAttachComparison(event.currentTarget.checked)}
              />
            )}
            <FormField
              id={REASON_ID}
              label="Motivo"
              optional
              help="Fica registrado com a aprovação. Não escreva senhas nem chaves."
              error={fieldErrors.reason}
              disabled={pending}
            >
              {({ invalid, ...control }) => (
                <Textarea
                  {...control}
                  invalid={invalid}
                  rows={3}
                  maxLength={REASON_MAX_CHARS}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              )}
            </FormField>
            <Checkbox
              id={ACKNOWLEDGE_ID}
              label={
                <>
                  Confirmo que quero ativar <span className="mono">{ref}</span>
                </>
              }
              invalid={fieldErrors.acknowledge !== undefined}
              description={fieldErrors.acknowledge}
              checked={acknowledged}
              disabled={pending}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
            />
          </div>
        )}
      </Dialog>
    </>
  );
}
