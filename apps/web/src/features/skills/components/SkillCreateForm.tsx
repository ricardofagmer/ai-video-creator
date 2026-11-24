'use client';

import { Alert, FormField, Input, Textarea, buttonClassName } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { createdSkillFiles } from '../skill-folder';
import { skillMarkdownOf } from '../skill-front-matter';
import { skillsHref } from '../skill-list';
import {
  SKILL_ENTRY_FILE,
  SKILL_OWNER_MAX,
  newSkillMetadataOf,
  skillAssetIdOf,
  skillInputProblems,
  type SkillFormInput,
} from '../skill-metadata';
import styles from '../skills.module.css';
import { SkillFields, skillFieldErrorsOf, type SkillFieldErrors } from './SkillFields';

const ID_PREFIX = 'skill-criar';

/** Write a new skill in the browser: the form becomes a one-file folder holding SKILL.md. */
export function SkillCreateForm(): ReactElement {
  const t = useWebMessages();
  const texts = t.skills;
  const router = useRouter();
  const [values, setValues] = useState<SkillFormInput>({ name: '', briefing: '', category: 'other' });
  const [assetId, setAssetId] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [owner, setOwner] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<SkillFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleFieldsChange(change: Partial<SkillFormInput>): void {
    setValues((current) => ({ ...current, ...change }));
    // The id follows the name until the person types an id of their own.
    if (change.name !== undefined && !idEdited) setAssetId(skillAssetIdOf(change.name));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fieldErrors = skillFieldErrorsOf(skillInputProblems({ ...values, owner, assetId }), texts);
    setErrors(fieldErrors);
    setFormError(null);
    if (Object.keys(fieldErrors).length > 0) return;

    setSaving(true);
    try {
      await browserStudioClient.createAsset({
        fields: { assetId, kind: 'skill', metadata: newSkillMetadataOf({ ...values, owner, entryFile: SKILL_ENTRY_FILE }) },
        content: { layout: 'folder', files: createdSkillFiles(skillMarkdownOf(values.name.trim(), values.briefing.trim(), body)) },
      });
      router.push(skillsHref(values.category, assetId));
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  return (
    <form className={layout.formWide} onSubmit={handleSubmit} noValidate>
      <SkillFields idPrefix={ID_PREFIX} values={values} errors={errors} disabled={saving} onChange={handleFieldsChange} t={texts} />
      <FormField id={`${ID_PREFIX}-id`} label={texts.form.idLabel} help={texts.form.idHelp} error={errors.id} disabled={saving}>
        {(control) => (
          <Input
            {...control}
            mono
            value={assetId}
            maxLength={64}
            onChange={(event) => {
              setIdEdited(true);
              setAssetId(event.target.value);
            }}
          />
        )}
      </FormField>
      <FormField id={`${ID_PREFIX}-responsavel`} label={texts.form.ownerLabel} error={errors.owner} disabled={saving}>
        {(control) => <Input {...control} value={owner} maxLength={SKILL_OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />}
      </FormField>
      <FormField id={`${ID_PREFIX}-conteudo`} label={texts.createForm.bodyLabel} help={texts.createForm.bodyHelp} optional disabled={saving}>
        {(control) => <Textarea {...control} className={styles.bodyInput} rows={12} value={body} onChange={(event) => setBody(event.target.value)} />}
      </FormField>
      {formError !== null && <Alert variant="error">{formError}</Alert>}
      <div className={layout.formFooter}>
        <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
          {saving ? texts.form.saving : texts.form.save}
        </button>
        <Link href="/skills" className={buttonClassName({ variant: 'secondary' })}>
          {texts.form.cancel}
        </Link>
      </div>
    </form>
  );
}
