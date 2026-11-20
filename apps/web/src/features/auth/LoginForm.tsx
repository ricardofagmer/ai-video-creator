'use client';

import { Alert, Button, Card, FormField, Input } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { ApiRequestError, ApiUnreachableError, browserStudioClient } from '@/lib/api';
import { API_UNREACHABLE_TEXT } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';

const HOME_PATH = '/execucoes';
const FIELD_ID = 'senha';

function loginErrorText(error: unknown): string {
  if (error instanceof ApiUnreachableError) return API_UNREACHABLE_TEXT;
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'Senha incorreta. Tente de novo.';
    if (error.status === 429) {
      const seconds = error.body?.details?.retryAfterSeconds;
      return seconds === undefined ? 'Muitas tentativas. Espere um pouco e tente de novo.' : `Muitas tentativas. Espere ${seconds} s e tente de novo.`;
    }
    if (error.reason === 'passphrase-not-configured') return 'Nenhuma senha foi definida neste Mac. Rode o script de instalação para definir a senha.';
    if (error.status === 403 || error.status === 503) return API_UNREACHABLE_TEXT;
  }
  return 'Não foi possível entrar. Tente de novo.';
}

/**
 * design/telas/01, block 2. The passphrase lives only in this field's state and in the login POST
 * body: never in a URL, never in storage, never logged. `method="post"` keeps it out of the URL
 * even if the page is submitted before hydration. The card heading is the page's single h1, drawn
 * here because the shared Card title stops at h2.
 */
export function LoginForm(): ReactElement {
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
      setError(loginErrorText(caught));
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <Card>
      <div className={layout.authCardHeading}>
        <h1 id={titleId} className="heading-3">
          Entrar
        </h1>
        <p id={descriptionId} className={`caption ${layout.authCardDescription}`}>
          Digite a senha deste Mac.
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
        <FormField id={FIELD_ID} label="Senha" disabled={pending}>
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
        <Button type="submit" variant="primary" block loading={pending} loadingLabel="Entrando…">
          Entrar
        </Button>
      </form>
    </Card>
  );
}
