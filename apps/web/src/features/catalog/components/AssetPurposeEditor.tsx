'use client';

import { AssetVersionViewSchema, apiPaths, type SetAssetPurposeRequest } from '@studio/shared/api';
import { ASSET_PURPOSE_MAX_CHARS } from '@studio/shared/catalog';
import { Alert, FormField, Textarea, buttonClassName } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { isAbort } from '@/features/runs/run-error-text';
import { browserTransport, requestJson } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';

export interface AssetPurposeEditorProps {
  assetId: string;
  version: number;
}

type EditorState = 'idle' | 'opening' | 'editing' | 'saving' | 'regenerating';

/**
 * The owner's controls of the purpose text (ADR 0012 decision 7, AP-10), rendered in the
 * `editor` slot of `AssetPurposeCard`. Edit reads the version first, so the draft starts from the
 * text as it is now and not from the text the page opened with; Save sends `PUT .../purpose`
 * (`purposeSource: owner`); Regenerate sends `POST .../purpose/generation`. After either write the
 * page reads the server again and the card starts from the new view. The draft is plain text: the
 * api trims it and refuses markup, and the card renders it as text, never HTML.
 */
export function AssetPurposeEditor({ assetId, version }: AssetPurposeEditorProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.purpose;
  const router = useRouter();
  const [state, setState] = useState<EditorState>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const callRef = useRef<AbortController | null>(null);
  const id = `asset-purpose-${assetId}-${version}`;
  const busy = state === 'opening' || state === 'saving' || state === 'regenerating';
  // A line break is a control character the api refuses; the purpose is one or two sentences.
  const trimmed = draft.replace(/\s+/g, ' ').trim();

  useEffect(() => () => callRef.current?.abort(), []);

  function nextCall(): AbortController {
    callRef.current?.abort();
    const controller = new AbortController();
    callRef.current = controller;
    return controller;
  }

  async function open(): Promise<void> {
    const controller = nextCall();
    setState('opening');
    setError(undefined);
    try {
      const view = await requestJson(browserTransport, { method: 'GET', path: apiPaths.assetVersion(assetId, version), signal: controller.signal }, AssetVersionViewSchema);
      setDraft(view.purpose);
      setState('editing');
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(describeApiError(caught, t));
      setState('idle');
    }
  }

  function cancel(): void {
    callRef.current?.abort();
    setDraft('');
    setError(undefined);
    setState('idle');
  }

  async function save(): Promise<void> {
    if (trimmed === '') return;
    const controller = nextCall();
    const body: SetAssetPurposeRequest = { purpose: trimmed };
    setState('saving');
    setError(undefined);
    try {
      await requestJson(browserTransport, { method: 'PUT', path: apiPaths.assetPurpose(assetId, version), body: { kind: 'json', value: body }, signal: controller.signal }, AssetVersionViewSchema);
      setState('idle');
      setDraft('');
      router.refresh();
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(describeApiError(caught, t));
      setState('editing');
    }
  }

  async function regenerate(): Promise<void> {
    const controller = nextCall();
    setState('regenerating');
    setError(undefined);
    try {
      await requestJson(browserTransport, { method: 'POST', path: apiPaths.assetPurposeGeneration(assetId, version), signal: controller.signal }, AssetVersionViewSchema);
      setState('idle');
      router.refresh();
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(describeApiError(caught, t));
      setState('idle');
    }
  }

  if (state === 'editing' || state === 'saving') {
    const saving = state === 'saving';
    return (
      <div className={layout.stack}>
        <FormField id={id} label={<span className="visually-hidden">{texts.heading}</span>} error={error} disabled={saving}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={ASSET_PURPOSE_MAX_CHARS}
              value={draft}
              disabled={saving}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                setError(undefined);
              }}
            />
          )}
        </FormField>
        <div className={styles.tagEditorActions}>
          <button
            type="button"
            className={buttonClassName({ variant: 'primary', size: 'sm' })}
            onClick={() => void save()}
            disabled={saving || trimmed === ''}
            aria-busy={saving}
          >
            {texts.save}
          </button>
          <button type="button" className={buttonClassName({ variant: 'secondary', size: 'sm' })} onClick={cancel} disabled={saving}>
            {texts.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={layout.stack}>
      {error !== undefined && <Alert variant="error">{error}</Alert>}
      <div className={styles.tagEditorActions}>
        <button
          type="button"
          className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          onClick={() => void open()}
          disabled={busy}
          aria-busy={state === 'opening'}
        >
          {texts.edit}
        </button>
        <button
          type="button"
          className={buttonClassName({ variant: 'ghost', size: 'sm' })}
          onClick={() => void regenerate()}
          disabled={busy}
          aria-busy={state === 'regenerating'}
        >
          {texts.regenerate}
        </button>
      </div>
    </div>
  );
}
