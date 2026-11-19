'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { type AssetStatus } from '@studio/shared/catalog';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { PromoteVersionButton } from '@/features/promotion/components/PromoteVersionButton';
import { browserStudioClient } from '@/lib/api';

interface RecipeStatusControlsProps {
  recipeId: string;
  version: number;
  status: AssetStatus;
  /** `?comparacao=` when the owner arrived from a comparison page. */
  evidenceComparisonId: string | null;
}

/** Outcome of a recipe status change, carried in `?aviso=` so the server page shows the Alert. */
type RecipeStatusNoticeKind = 'receita-ativada' | 'receita-descontinuada' | 'receita-erro';

const noticeKinds: readonly RecipeStatusNoticeKind[] = ['receita-ativada', 'receita-descontinuada', 'receita-erro'];

/**
 * Recipe header actions, after the catalog's `VersionStatusControls` (design/telas/03). Rev 3
 * (SPEC 0003 L6, B15): "Ativar…" opens the promotion dialog, which records one owner approval
 * through `POST /recipes/:id/versions/:n/promotion`; `PUT .../status` is used only for
 * "Descontinuar", behind a confirmation Dialog. Deprecated versions cannot start runs.
 */
export function RecipeStatusControls({ recipeId, version, status, evidenceComparisonId }: RecipeStatusControlsProps): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function report(notice: RecipeStatusNoticeKind): void {
    router.replace(`${pathname}?versao=${version}&aviso=${notice}`);
    router.refresh();
  }

  async function deprecate(): Promise<void> {
    setPending(true);
    setConfirmOpen(false);
    try {
      await browserStudioClient.setRecipeStatus(recipeId, version, { status: 'deprecated' });
      report('receita-descontinuada');
    } catch {
      // The outcome is reported through the page Alert; the api's English message is never shown.
      report('receita-erro');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {status !== 'active' && (
        <PromoteVersionButton
          target={{ kind: 'recipe', recipeId, version }}
          disabled={pending}
          evidenceComparisonId={evidenceComparisonId}
          onPromoted={() => report('receita-ativada')}
        />
      )}
      {status === 'active' && (
        <Button variant="secondary" disabled={pending} loading={pending} loadingLabel="Descontinuando…" onClick={() => setConfirmOpen(true)}>
          Descontinuar
        </Button>
      )}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Descontinuar a versão v${version}?`}
        description="Execuções que já usam esta versão continuam como estão. Novas execuções não poderão partir dela."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void deprecate()}>
              Descontinuar
            </Button>
          </>
        }
      />
    </>
  );
}

interface RecipeStatusNoticeProps {
  /** The raw `?aviso=` value; anything that is not a recipe status notice renders nothing. */
  notice: string | string[] | undefined;
  version: number;
}

/** The Alert for the outcome `RecipeStatusControls` reported in `?aviso=`. */
export function RecipeStatusNotice({ notice, version }: RecipeStatusNoticeProps): ReactElement | null {
  const kind = noticeKinds.find((candidate) => candidate === notice);
  if (kind === 'receita-ativada') return <Alert variant="success">{`Versão ${version} ativada.`}</Alert>;
  if (kind === 'receita-descontinuada') return <Alert variant="info">{`Versão ${version} descontinuada.`}</Alert>;
  if (kind === 'receita-erro') return <Alert variant="error">Não foi possível mudar o status desta versão. Tente de novo.</Alert>;
  return null;
}
