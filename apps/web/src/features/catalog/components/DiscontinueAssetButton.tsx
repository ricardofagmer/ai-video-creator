'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { discontinueAsset } from '../discontinue-asset';

interface DiscontinueAssetButtonProps {
  assetId: string;
  /** The item's catalog name, for the dialog title and the button's accessible name. */
  name: string;
  size?: 'sm' | 'md';
  /** Where to go once the item is gone from the lists; without it the current page is refreshed. */
  afterHref?: string;
}

/**
 * "Delete" on a catalog item: after a confirmation, every version of the item is deprecated, which
 * takes the item out of the catalog lists. Nothing is removed from the database, so the dialog says
 * what happens and how to bring the item back. A failure stays in the dialog, in the active language.
 */
export function DiscontinueAssetButton({ assetId, name, size = 'sm', afterHref }: DiscontinueAssetButtonProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.deleteItem;
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function close(): void {
    if (pending) return;
    setConfirmOpen(false);
    setProblem(null);
  }

  async function confirm(): Promise<void> {
    setPending(true);
    setProblem(null);
    try {
      await discontinueAsset(browserStudioClient, assetId);
      setConfirmOpen(false);
      if (afterHref !== undefined) router.replace(afterHref);
      router.refresh();
    } catch (error) {
      setProblem(describeApiError(error, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size={size} aria-label={texts.labelHidden(name)} onClick={() => setConfirmOpen(true)}>
        {texts.label}
      </Button>
      <Dialog
        open={confirmOpen}
        onClose={close}
        role="alertdialog"
        title={texts.confirmTitle(name)}
        description={texts.confirmDescription}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={close}>
              {texts.cancel}
            </Button>
            <Button variant="primary" loading={pending} loadingLabel={texts.deleting} onClick={() => void confirm()}>
              {texts.label}
            </Button>
          </>
        }
      >
        {problem !== null && <Alert variant="error">{texts.failed(problem)}</Alert>}
      </Dialog>
    </>
  );
}
