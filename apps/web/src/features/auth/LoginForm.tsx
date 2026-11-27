'use client';

import { Alert, Button, Card, FormField, Input } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { ApiRequestError, ApiUnreachableError, browserStudioClient } from '@/lib/api';
import { apiUnreachableText } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import styles from '@/features/auth/login.module.css';
import layout from '@/features/common/layout.module.css';

const HOME_PATH = '/execucoes';
const FIELD_ID = 'senha';

function loginErrorText(error: unknown, t: WebMessages): string {
  const texts = t.auth.errors;
  if (error instanceof ApiUnreachableError) return apiUnreachableText(t);
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return texts.wrongPassphrase;
    if (error.status === 429) {
      const seconds = error.body?.details?.retryAfterSeconds;
      return seconds === undefined ? texts.tooManyAttempts : texts.tooManyAttemptsWait(seconds);
    }
    if (error.reason === 'passphrase-not-configured') return texts.notConfigured;
    if (error.status === 403 || error.status === 503) return apiUnreachableText(t);
  }
  return texts.failed;
}

/**
 * design/telas/01, block 2. The passphrase lives only in this field's state and in the login POST
 * body: never in a URL, never in storage, never logged. `method="post"` keeps it out of the URL
 * even if the page is submitted before hydration. The card heading is the page's single h1, drawn
 * here because the shared Card title stops at h2.
 */
export function LoginForm(): ReactElement {
  const t = useWebMessages();
  const texts = t.auth.form;
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || passphrase === '') return;
    setPending(true);
    setError(null);
    try {
      await browserStudioClient.login({ passphrase });
      setPassphrase('');
      router.replace(HOME_PATH);
      router.refresh();
    } catch (caught) {
      setPassphrase('');
      setError(loginErrorText(caught, t));
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <Card>
      <div className={styles.cardHeading}>
        <p className="eyebrow">{texts.eyebrow}</p>
        <h1 id={titleId} className="heading-1">
          {texts.title}
        </h1>
        <p id={descriptionId} className={`caption ${styles.cardDescription}`}>
          {texts.description}
        </p>
      </div>
      <form
        method="post"
        className={layout.stack}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        {error !== null && (
          <Alert variant="error">
            <span id={`${FIELD_ID}-alert`}>{error}</span>
          </Alert>
        )}
        <FormField id={FIELD_ID} label={texts.passphrase} disabled={pending}>
          {({ invalid, ...control }) => (
            <Input
              {...control}
              ref={inputRef}
              type="password"
              name="passphrase"
              autoComplete="current-password"
              maxLength={1024}
              invalid={error !== null || invalid}
              aria-describedby={error !== null ? `${FIELD_ID}-alert` : control['aria-describedby']}
              value={passphrase}
              onChange={(event) => setPassphrase(event.currentTarget.value)}
              autoFocus
            />
          )}
        </FormField>
        <Button type="submit" variant="primary" block loading={pending} loadingLabel={texts.signingIn}>
          {texts.submit}
        </Button>
      </form>
    </Card>
  );
}
