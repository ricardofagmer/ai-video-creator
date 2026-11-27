'use client';

import { Button, Dialog } from '@studio/ui';
import { type AssetStatus } from '@studio/shared/catalog';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { PromoteVersionButton } from '@/features/promotion/components/PromoteVersionButton';
import { type QualityFigures } from '@/features/quality/quality-labels';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { LICENSE_ALERT_ID, type StatusNotice } from '../status-notice';

interface VersionStatusControlsProps {
  assetId: string;
  version: number;
  status: AssetStatus;
  /** Criterion 7: activation is blocked until license and provenance are filled. */
  activationBlocked: boolean;
  quality: QualityFigures;
  activeLearnings: number;
  /** `?comparacao=` when the owner arrived from a comparison page. */
  evidenceComparisonId: string | null;
}

/**
 * design/telas/03 header actions. Rev 3 (SPEC 0003 L6, R2-AC-18): "Ativar…" opens the promotion
 * dialog, which records one owner approval through `POST .../promotion`; the status route is used
 * only to deprecate ("Descontinuar", behind a confirmation Dialog). The outcome is reported through
 * `?aviso=` so the server-rendered page shows the matching Alert after refresh.
 */
export function VersionStatusControls({
  assetId,
  version,
  status,
  activationBlocked,
  quality,
  activeLearnings,
  evidenceComparisonId,
}: VersionStatusControlsProps): ReactElement {
  const texts = useWebMessages().catalog.statusControls;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function report(notice: StatusNotice): void {
    router.replace(`${pathname}?versao=${version}&aviso=${notice}`);
    router.refresh();
  }

  async function deprecate(): Promise<void> {
    setPending(true);
    setConfirmOpen(false);
    try {
      await browserStudioClient.setAssetStatus(assetId, version, { status: 'deprecated' });
      report('descontinuada');
    } catch {
      // The outcome is reported through the page Alert; the api's English message is never shown.
      report('erro');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {status !== 'active' && (
        <PromoteVersionButton
          target={{ kind: 'asset', assetId, version, quality, activeLearnings }}
          disabled={activationBlocked || pending}
          describedBy={activationBlocked ? LICENSE_ALERT_ID : undefined}
          evidenceComparisonId={evidenceComparisonId}
          onPromoted={() => report('ativada')}
        />
      )}
      {status === 'active' && (
        <Button variant="secondary" disabled={pending} loading={pending} loadingLabel={texts.deprecating} onClick={() => setConfirmOpen(true)}>
          {texts.deprecate}
        </Button>
      )}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={texts.confirmTitle(version)}
        description={texts.confirmDescription}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {texts.cancel}
            </Button>
            <Button variant="primary" onClick={() => void deprecate()}>
              {texts.deprecate}
            </Button>
          </>
        }
      />
    </>
  );
}
