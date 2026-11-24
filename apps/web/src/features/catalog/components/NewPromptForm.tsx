'use client';

import { Alert, FormField, Input, Textarea, buttonClassName, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../catalog.module.css';
import { catalogHref } from '../catalog-query';
import { PROMPT_NAME_MAX, PROMPT_OWNER_MAX, PROMPT_TEXT_MAX, promptDraftOf } from '../prompt-draft';

const FIELD_IDS = {
  name: 'prompt-nome',
  text: 'prompt-texto',
  owner: 'prompt-responsavel',
} as const;

type FieldErrors = Partial<Record<'name' | 'text' | 'owner', string>>;

interface NewPromptFormProps {
  /** The id from `?salvo=` after a save, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
}

/**
 * The Prompts section's form (docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md): a
 * named prompt text saved as a draft prompt version, ready to fill the run's instructions for the AI.
 */
export function NewPromptForm({ savedAssetId }: NewPromptFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.promptForm;
  const router = useRouter();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (name.trim() === '') errors.name = texts.nameRequired;
    if (text.trim() === '') errors.text = texts.textRequired;
    if (owner.trim() === '') errors.owner = texts.ownerRequired;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const draft = promptDraftOf({ name, owner, text });
    try {
      await browserStudioClient.createAsset({
        fields: { assetId: draft.assetId, kind: draft.kind, metadata: draft.metadata },
        content: { layout: 'file', file: draft.file },
      });
      const target = catalogHref({ section: 'prompts' });
      router.push(`${target}${target.includes('?') ? '&' : '?'}salvo=${draft.assetId}`);
      setName('');
      setText('');
      setSaving(false);
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="prompt-novo-titulo" className={layout.stack}>
      <h2 id="prompt-novo-titulo" className="heading-2">
        {texts.title}
      </h2>
      <p className="caption">{texts.help}</p>
      {savedAssetId !== null && (
        <Alert variant="success">
          {texts.saved}{' '}
          <Link href={`/catalogo/${savedAssetId}`} className={textLinkClassName()}>
            {texts.openSaved}
          </Link>
        </Alert>
      )}
      <form className={styles.promptForm} onSubmit={save} noValidate>
        <FormField id={FIELD_IDS.name} label={texts.name} error={fieldErrors.name}>
          {(control) => <Input {...control} value={name} maxLength={PROMPT_NAME_MAX} onChange={(event) => setName(event.target.value)} />}
        </FormField>
        <FormField id={FIELD_IDS.text} label={texts.text} error={fieldErrors.text} help={texts.remaining(PROMPT_TEXT_MAX - text.length)}>
          {(control) => (
            <Textarea {...control} rows={8} value={text} maxLength={PROMPT_TEXT_MAX} onChange={(event) => setText(event.target.value)} />
          )}
        </FormField>
        <FormField id={FIELD_IDS.owner} label={texts.owner} error={fieldErrors.owner}>
          {(control) => <Input {...control} value={owner} maxLength={PROMPT_OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />}
        </FormField>
        {formError !== null && <Alert variant="error">{formError}</Alert>}
        <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
          {saving ? texts.saving : texts.submit}
        </button>
      </form>
    </section>
  );
}
