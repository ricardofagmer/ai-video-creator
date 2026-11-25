'use client';

import { PurposeBackfillResultViewSchema, apiPaths } from '@studio/shared/api';
import { Alert, Button, Dialog } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { browserTransport, requestJson } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';

export interface PurposeBackfillButtonProps {
  /** `GET purposes/backfill` `missing`, read by the catalog page on the server. */
  missing: number;
}

type BackfillState =
  | { status: 'closed' }
  | { status: 'confirming' }
  | { status: 'requesting' }
  | { status: 'done'; requested: number; failed: number }
  | { status: 'failed'; message: string };

/**
 * "Para que serve" backfill on the catalog page (ADR 0012 decision 9, AP-13). The button shows only
 * while some version lacks a purpose; a click opens the confirmation with the count, and only its
 * confirm button calls `POST purposes/backfill`. After the call the page reads the count again, so
 * the button shows the versions still missing or goes away; the result line stays until then.
 */
export function PurposeBackfillButton({ missing }: PurposeBackfillButtonProps): ReactElement | null {
  const t = useWebMessages();
  const texts = t.catalog.purpose;
  const router = useRouter();
  const [state, setState] = useState<BackfillState>({ status: 'closed' });
  const requesting = state.status === 'requesting';

  async function confirm(): Promise<void> {
    if (requesting) return;
    setState({ status: 'requesting' });
    try {
      const result = await requestJson(browserTransport, { method: 'POST', path: apiPaths.purposeBackfill() }, PurposeBackfillResultViewSchema);
      setState({ status: 'done', requested: result.requested, failed: result.failed });
      router.refresh();
    } catch (error) {
      setState({ status: 'failed', message: describeApiError(error, t) });
    }
  }

  function close(): void {
    if (!requesting) setState({ status: 'closed' });
  }

  if (missing <= 0 && state.status !== 'done') return null;

  return (
    <>
      {state.status === 'done' && <Alert variant={state.requested > 0 ? 'success' : 'warning'}>{texts.backfillDone(state.requested)}</Alert>}
      {/* The asset job queue holds 10 open jobs; the rest are reported so the owner presses again later. */}
      {state.status === 'done' && state.failed > 0 && <Alert variant="warning">{texts.backfillQueueFull(state.failed)}</Alert>}
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      {missing > 0 && (
        <Button variant="secondary" disabled={requesting} onClick={() => setState({ status: 'confirming' })}>
          {texts.backfillButton(missing)}
        </Button>
      )}
      <Dialog
        open={state.status === 'confirming' || requesting}
        onClose={close}
        role="alertdialog"
        title={texts.backfillConfirmTitle}
        description={texts.backfillConfirmBody(missing)}
        footer={
          <>
            <Button variant="secondary" disabled={requesting} onClick={close}>
              {texts.cancel}
            </Button>
            <Button variant="primary" loading={requesting} onClick={() => void confirm()}>
              {texts.backfillButton(missing)}
            </Button>
          </>
        }
      />
    </>
  );
}
