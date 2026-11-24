'use client';

import { Alert, Button, Checkbox, FormField, Textarea, formatUsd, useI18n } from '@studio/ui';
import { curationBounds, type CurationSubject } from '@studio/shared/curation';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { curationHref } from '../curation-labels';
import { browserCurationsApi } from '../curations-api';
import styles from '../curations.module.css';

interface RequestCurationFormProps {
  subject: CurationSubject;
}

const FOCUS_ID = 'curadoria-foco';
const CONSENT_ID = 'curadoria-consentimento';

/**
 * "Pedir proposta ao curador" (SPEC 0005 section 5.9, B3, Q2): an optional focus of up to 500
 * characters and the explicit $1.00 consent beside the button. Only a checked consent sends
 * `acceptedWorstCaseUsd`, and it sends exactly `curationBounds.maxUsd`. The request writes nothing
 * to the catalog; the owner lands on the curation page, which follows its progress.
 */
export function RequestCurationForm({ subject }: RequestCurationFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.curations.request;
  const MAX_USD_TEXT = formatUsd(curationBounds.maxUsd, useI18n().locale);
  const router = useRouter();
  const [focus, setFocus] = useState('');
  const [consented, setConsented] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const trimmedFocus = focus.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    if (trimmedFocus.length > curationBounds.focusChars) {
      setFocusError(texts.focusTooLong(curationBounds.focusChars));
      document.getElementById(FOCUS_ID)?.focus();
      return;
    }
    setFocusError(null);
    if (!consented) {
      setConsentError(texts.consentRequired(MAX_USD_TEXT));
      document.getElementById(CONSENT_ID)?.focus();
      return;
    }
    setConsentError(null);
    setPending(true);
    try {
      const curation = await browserCurationsApi.requestCuration({
        subject,
        ownerFocus: trimmedFocus === '' ? undefined : trimmedFocus,
        acceptedWorstCaseUsd: curationBounds.maxUsd,
      });
      router.push(curationHref(curation.curationId));
    } catch (error) {
      setServerError(describeApiError(error, t));
      setPending(false);
    }
  }

  return (
    <form className={styles.consent} onSubmit={(event) => void handleSubmit(event)} noValidate>
      {serverError !== null && <Alert variant="error">{serverError}</Alert>}
      <FormField
        id={FOCUS_ID}
        label={texts.focusLabel}
        optional
        help={texts.focusHelp(trimmedFocus.length, curationBounds.focusChars)}
        error={focusError ?? undefined}
        disabled={pending}
      >
        {({ invalid, ...control }) => (
          <Textarea
            {...control}
            invalid={invalid}
            rows={2}
            maxLength={curationBounds.focusChars}
            value={focus}
            onChange={(event) => setFocus(event.currentTarget.value)}
          />
        )}
      </FormField>
      <p className="caption">{texts.costNote(MAX_USD_TEXT)}</p>
      <div className={styles.actions}>
        <Checkbox
          id={CONSENT_ID}
          label={texts.consent(MAX_USD_TEXT)}
          invalid={consentError !== null}
          description={consentError ?? undefined}
          checked={consented}
          disabled={pending}
          onChange={(event) => setConsented(event.currentTarget.checked)}
        />
        <Button type="submit" variant="secondary" loading={pending} loadingLabel={texts.requesting}>
          {texts.request}
        </Button>
      </div>
    </form>
  );
}
