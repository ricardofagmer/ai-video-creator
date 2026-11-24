'use client';

import { Alert, Button, FormField, Input } from '@studio/ui';
import { metricsBounds, parsePublicationUrl } from '@studio/shared/metrics';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { apiReasonText, describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import layout from '@/features/common/layout.module.css';
import { localTodayIso } from '../metric-labels';
import { browserMetricsApi } from '../metrics-api';
import styles from '../metrics.module.css';
import { PUBLICATION_URL_INPUT_ID } from '../publication-link';

interface PublicationAddFormProps {
  runId: string;
}

const URL_ID = PUBLICATION_URL_INPUT_ID;
const PUBLISHED_ON_ID = 'publicacao-data';

/**
 * "Link do vídeo publicado" (SPEC 0006 sections 5.1 and 5.9, B1). The link is checked in the
 * browser with the shared `parsePublicationUrl` only to answer early; the api parses it again,
 * stores only the rebuilt canonical URL and is the boundary. The link is never opened or fetched.
 */
export function PublicationAddForm({ runId }: PublicationAddFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.metrics.publications.add;
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [publishedOn, setPublishedOn] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    const trimmed = url.trim();
    const parsed = parsePublicationUrl(trimmed);
    if (parsed.status === 'refused') {
      setUrlError(trimmed === '' ? texts.urlRequired : apiReasonText(parsed.reason, t));
      document.getElementById(URL_ID)?.focus();
      return;
    }
    setUrlError(null);
    if (publishedOn !== '' && publishedOn > localTodayIso()) {
      setDateError(texts.futureDate);
      document.getElementById(PUBLISHED_ON_ID)?.focus();
      return;
    }
    setDateError(null);
    setPending(true);
    try {
      await browserMetricsApi.recordPublication(runId, { url: trimmed, publishedOn: publishedOn === '' ? undefined : publishedOn });
      setUrl('');
      setPublishedOn('');
      router.refresh();
    } catch (error) {
      setServerError(describeApiError(error, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <div className={layout.fieldGrid}>
        <FormField
          id={URL_ID}
          label={texts.url}
          help={texts.urlHelp}
          error={urlError ?? undefined}
          disabled={pending}
          className={layout.fieldWide}
        >
          {({ invalid, ...control }) => (
            <Input
              {...control}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              invalid={invalid}
              maxLength={metricsBounds.urlChars}
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
            />
          )}
        </FormField>
        <FormField id={PUBLISHED_ON_ID} label={texts.publishedOn} optional error={dateError ?? undefined} disabled={pending}>
          {({ invalid, ...control }) => (
            <Input
              {...control}
              type="date"
              invalid={invalid}
              max={localTodayIso()}
              value={publishedOn}
              onChange={(event) => setPublishedOn(event.currentTarget.value)}
            />
          )}
        </FormField>
      </div>
      <div className={styles.actions}>
        <Button type="submit" variant="secondary" loading={pending} loadingLabel={texts.saving}>
          {texts.submit}
        </Button>
      </div>
    </form>
  );
}
