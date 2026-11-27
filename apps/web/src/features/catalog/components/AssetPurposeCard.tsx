'use client';

import { AssetVersionViewSchema, apiPaths, type AssetVersionView } from '@studio/shared/api';
import { Alert, Badge, Button, Card, Spinner } from '@studio/ui';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { waitFor } from '@/features/common/wait-for';
import { usePageVisible } from '@/features/runs/hooks/usePageVisible';
import { isAbort } from '@/features/runs/run-error-text';
import { browserTransport, requestJson } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';

/** The three view fields the card reads (C-P1, C-P2). */
export type AssetPurposeFields = Pick<AssetVersionView, 'purpose' | 'purposeSource' | 'purposeJob'>;

export interface AssetPurposeCardProps {
  assetId: string;
  version: number;
  initial: AssetPurposeFields;
  /** The owner's editor (ticket 03); rendered under the text when given. */
  editor?: ReactNode;
}

/** Same cadence as the reference analysis card: a purpose is one short call. */
const PURPOSE_POLL_INTERVAL_MS = 3_000;
const PURPOSE_WAIT_MAX_MS = 2 * 60_000;

function isPending(fields: AssetPurposeFields): boolean {
  return fields.purposeJob?.status === 'requested' || fields.purposeJob?.status === 'running';
}

function purposeFieldsOf(view: AssetVersionView): AssetPurposeFields {
  return { purpose: view.purpose, purposeSource: view.purposeSource, purposeJob: view.purposeJob };
}

/**
 * "Para que serve" of a catalog version (ADR 0012, AP-09). The text is the AI's or the owner's and
 * is rendered as plain text, never HTML. While the job is open the card shows the pending line and
 * reads the version again every 3 s for at most 2 min; a failed or refused job shows its reason and
 * a Retry button that calls `POST .../purpose/generation`.
 */
export function AssetPurposeCard({ assetId, version, initial, editor }: AssetPurposeCardProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.purpose;
  const visible = usePageVisible();
  const [fields, setFields] = useState<AssetPurposeFields>(initial);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const waitStartedAtRef = useRef(Date.now());
  const callRef = useRef<AbortController | null>(null);
  const pending = isPending(fields);

  useEffect(() => () => callRef.current?.abort(), []);

  useEffect(() => {
    if (!pending || !visible || waitedTooLong || error !== null) return undefined;
    const controller = new AbortController();
    const loop = async (): Promise<void> => {
      try {
        let next: AssetPurposeFields;
        do {
          await waitFor(PURPOSE_POLL_INTERVAL_MS, controller.signal);
          const view = await requestJson(browserTransport, { method: 'GET', path: apiPaths.assetVersion(assetId, version), signal: controller.signal }, AssetVersionViewSchema);
          next = purposeFieldsOf(view);
          setFields(next);
          if (isPending(next) && Date.now() - waitStartedAtRef.current >= PURPOSE_WAIT_MAX_MS) {
            setWaitedTooLong(true);
            return;
          }
        } while (isPending(next));
      } catch (caught) {
        if (isAbort(caught) || controller.signal.aborted) return;
        setError(caught);
      }
    };
    void loop();
    return () => controller.abort();
  }, [pending, visible, waitedTooLong, error, assetId, version]);

  const retry = useCallback(async (): Promise<void> => {
    callRef.current?.abort();
    const controller = new AbortController();
    callRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const view = await requestJson(browserTransport, { method: 'POST', path: apiPaths.assetPurposeGeneration(assetId, version), signal: controller.signal }, AssetVersionViewSchema);
      waitStartedAtRef.current = Date.now();
      setWaitedTooLong(false);
      setFields(purposeFieldsOf(view));
    } catch (caught) {
      if (!isAbort(caught)) setError(caught);
    } finally {
      if (callRef.current === controller) setBusy(false);
    }
  }, [assetId, version]);

  const job = fields.purposeJob;
  const ended = job?.status === 'failed' || job?.status === 'refused';

  return (
    <Card
      title={texts.heading}
      actions={
        <>
          {fields.purposeSource === 'owner' && <Badge tone="info">{texts.ownerEdited}</Badge>}
          {ended && (
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void retry()}>
              {texts.retry}
            </Button>
          )}
        </>
      }
    >
      <div className={layout.stack}>
        {error !== null && <Alert variant="error">{describeApiError(error, t)}</Alert>}
        {fields.purpose === '' ? !pending && <p className="caption">{texts.empty}</p> : <p>{fields.purpose}</p>}
        {pending &&
          (waitedTooLong ? (
            <Alert variant="info">{texts.pending}</Alert>
          ) : (
            <div role="status" className={layout.row}>
              <Spinner size="sm" decorative />
              <span>{texts.pending}</span>
            </div>
          ))}
        {job?.status === 'failed' && <Alert variant="warning">{texts.failed(job.errorCode)}</Alert>}
        {job?.status === 'refused' && <Alert variant="warning">{texts.refused(job.errorCode)}</Alert>}
        {editor}
      </div>
    </Card>
  );
}
