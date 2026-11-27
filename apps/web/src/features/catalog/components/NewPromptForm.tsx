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
import { type AssetVersionView } from '@studio/shared/api';
import { PROMPT_NAME_MAX, PROMPT_OWNER_MAX, PROMPT_TEXT_MAX, promptDraftOf, promptVersionOf } from '../prompt-draft';

const FIELD_IDS = {
  name: 'prompt-nome',
  text: 'prompt-texto',
  owner: 'prompt-responsavel',
} as const;

type FieldErrors = Partial<Record<'name' | 'text' | 'owner', string>>;

/** The prompt version named by `?editar=`, loaded on the server; `unavailable` when the ref or the load failed. */
export type PromptEditing =
  | { status: 'ready'; ref: string; version: AssetVersionView; text: string }
  | { status: 'unavailable'; ref: string };

interface NewPromptFormProps {
  /** The id from `?salvo=` after a save, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
  /** Set when the owner pressed Edit on a prompt card: the form opens filled in and saves version N+1. */
  editing: PromptEditing | null;
}

/**
 * The Prompts section's form (docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md): a
 * named prompt text saved as a draft prompt version, ready to fill the run's instructions for the AI.
 */
export function NewPromptForm({ savedAssetId, editing }: NewPromptFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.promptForm;
  const router = useRouter();
  const base = editing?.status === 'ready' ? editing.version : null;
  const [name, setName] = useState(base?.name ?? '');
  const [text, setText] = useState(editing?.status === 'ready' ? editing.text : '');
  const [owner, setOwner] = useState(base?.owner ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The form stays folded behind its button so the prompt list leads the section.
  const [open, setOpen] = useState(base !== null);
  const promptsHref = catalogHref({ section: 'prompts' });

  function close(): void {
    setFieldErrors({});
    setFormError(null);
    setOpen(false);
    // Drops `?editar=` so a reload does not reopen the edit.
    if (editing !== null) router.push(promptsHref);
  }

  async function store(): Promise<string> {
    if (base !== null) {
      const next = promptVersionOf(base, { name, owner, text });
      await browserStudioClient.saveAssetVersion(base.id, { fields: { metadata: next.metadata }, content: { layout: 'file', file: next.file } });
      return base.id;
    }
    const draft = promptDraftOf({ name, owner, text });
    await browserStudioClient.createAsset({
      fields: { assetId: draft.assetId, kind: draft.kind, metadata: draft.metadata },
      content: { layout: 'file', file: draft.file },
    });
    return draft.assetId;
  }

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
    try {
      const savedId = await store();
      router.push(`${promptsHref}${promptsHref.includes('?') ? '&' : '?'}salvo=${savedId}`);
      setName('');
      setText('');
      setSaving(false);
      setOpen(false);
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  const savedAlert = savedAssetId !== null && (
    <Alert variant="success">
      {texts.saved}{' '}
      <Link href={`/catalogo/${savedAssetId}`} className={textLinkClassName()}>
        {texts.openSaved}
      </Link>
    </Alert>
  );

  const unavailableAlert = editing?.status === 'unavailable' && <Alert variant="error">{texts.editUnavailable}</Alert>;

  if (!open) {
    return (
      <div className={layout.stack}>
        {savedAlert}
        {unavailableAlert}
        <button type="button" className={`${buttonClassName({ variant: 'primary' })} ${styles.promptOpenButton}`} onClick={() => setOpen(true)}>
          {texts.open}
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="prompt-novo-titulo" className={layout.stack}>
      <h2 id="prompt-novo-titulo" className="heading-2">
        {base === null ? texts.title : texts.editTitle(base.name)}
      </h2>
      <p className="caption">{base === null ? texts.help : texts.editHelp}</p>
      {savedAlert}
      <form className={styles.promptForm} onSubmit={save} noValidate>
        <FormField id={FIELD_IDS.name} label={texts.name} error={fieldErrors.name}>
          {(control) => <Input {...control} autoFocus value={name} maxLength={PROMPT_NAME_MAX} onChange={(event) => setName(event.target.value)} />}
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
        <div className={styles.promptFormActions}>
          <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
            {saving ? texts.saving : base === null ? texts.submit : texts.editSubmit}
          </button>
          <button type="button" className={buttonClassName({ variant: 'secondary' })} onClick={close} disabled={saving}>
            {texts.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
