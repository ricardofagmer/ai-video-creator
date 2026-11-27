'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { browserMetricsApi } from '../metrics-api';

interface RemovePublicationButtonProps {
  runId: string;
  publicationId: string;
}

type RemoveState = { status: 'closed' } | { status: 'confirming' } | { status: 'removing' } | { status: 'failed'; message: string };

/**
 * Removes a publication recorded by mistake (SPEC 0006 section 4.4). Shown only while it has no
 * snapshot; the api refuses otherwise (409 `publication-has-metrics`). It removes the record only:
 * nothing on the platform changes.
 */
export function RemovePublicationButton({ runId, publicationId }: RemovePublicationButtonProps): ReactElement {
  const t = useWebMessages();
  const texts = t.metrics.publications.remove;
  const router = useRouter();
  const [state, setState] = useState<RemoveState>({ status: 'closed' });
  const removing = state.status === 'removing';

  async function remove(): Promise<void> {
    if (removing) return;
    setState({ status: 'removing' });
    try {
      await browserMetricsApi.removePublication(runId, publicationId);
      setState({ status: 'closed' });
      router.refresh();
    } catch (error) {
      setState({ status: 'failed', message: describeApiError(error, t) });
    }
  }

  function close(): void {
    if (!removing) setState({ status: 'closed' });
  }

  return (
    <>
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      <Button variant="secondary" size="sm" disabled={removing} onClick={() => setState({ status: 'confirming' })}>
        {texts.button}
      </Button>
      <Dialog
        open={state.status === 'confirming' || removing}
        onClose={close}
        role="alertdialog"
        title={texts.title}
        description={texts.description}
        footer={
          <>
            <Button variant="secondary" disabled={removing} onClick={close}>
              {texts.cancel}
            </Button>
            <Button variant="danger" loading={removing} loadingLabel={texts.removing} onClick={() => void remove()}>
              {texts.confirm}
            </Button>
          </>
        }
      />
    </>
  );
}
