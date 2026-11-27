'use client';

import { Alert, FormField, Input, UploadDropzone, buttonClassName, formatBytes, useI18n } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { parseSkillFrontMatter } from '../skill-front-matter';
import { skillFolderOf, type SkillFolder } from '../skill-folder';
import { skillsHref } from '../skill-list';
import {
  SKILL_ENTRY_FILE,
  SKILL_OWNER_MAX,
  newSkillMetadataOf,
  skillAssetIdOf,
  skillInputProblems,
  type SkillFormInput,
} from '../skill-metadata';
import { SkillFields, skillFieldErrorsOf, skillFolderProblemText, type SkillFieldErrors } from './SkillFields';

const ID_PREFIX = 'skill-importar';

/**
 * Import a skill folder (docs/specs/2026-11-23-skills-page-design.md). SKILL.md is read in the browser
 * only to prefill the name and briefing; the folder is uploaded as is and the api checks it again.
 */
export function SkillImportForm(): ReactElement {
  const t = useWebMessages();
  const texts = t.skills;
  const { locale } = useI18n();
  const router = useRouter();
  const [folder, setFolder] = useState<SkillFolder | null>(null);
  const [assetId, setAssetId] = useState('');
  const [values, setValues] = useState<SkillFormInput>({ name: '', briefing: '', category: 'other' });
  const [owner, setOwner] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [errors, setErrors] = useState<SkillFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFiles(files: File[]): Promise<void> {
    setFormError(null);
    setPrefilled(false);
    const result = skillFolderOf(files);
    if (result.status === 'problem') {
      setFolder(null);
      setErrors((current) => ({ ...current, files: skillFolderProblemText(result.problem, t, locale) }));
      return;
    }
    setFolder(result.folder);
    setErrors((current) => ({ ...current, files: undefined }));
    let frontMatter = { name: '', description: '' };
    try {
      frontMatter = parseSkillFrontMatter(await result.folder.entry.text());
    } catch {
      // The upload still works without a readable SKILL.md preview; the person fills the fields in.
      setFormError(texts.form.errors.folderUnreadable);
    }
    const name = frontMatter.name || result.folder.folderName;
    setValues((current) => ({ ...current, name: name || current.name, briefing: frontMatter.description || current.briefing }));
    setAssetId(skillAssetIdOf(result.folder.folderName || name));
    setPrefilled(frontMatter.name !== '' || frontMatter.description !== '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fieldErrors = skillFieldErrorsOf(skillInputProblems({ ...values, owner, assetId }), texts);
    if (folder === null) fieldErrors.files = texts.form.errors.folderRequired;
    setErrors(fieldErrors);
    setFormError(null);
    if (folder === null || Object.keys(fieldErrors).length > 0) return;

    setSaving(true);
    try {
      await browserStudioClient.createAsset({
        fields: { assetId, kind: 'skill', metadata: newSkillMetadataOf({ ...values, owner, entryFile: SKILL_ENTRY_FILE }) },
        content: { layout: 'folder', files: folder.files },
      });
      router.push(skillsHref(values.category, assetId));
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  const totalBytes = folder?.files.reduce((sum, item) => sum + item.file.size, 0) ?? 0;

  return (
    <form className={layout.form} onSubmit={handleSubmit} noValidate>
      <FormField id={`${ID_PREFIX}-pasta`} label={texts.importForm.folderLabel} error={errors.files} disabled={saving}>
        {(control) => (
          <UploadDropzone
            id={control.id}
            aria-describedby={control['aria-describedby']}
            invalid={control.invalid}
            disabled={saving}
            allowFolder
            multiple
            hint={texts.importForm.folderHint}
            onFiles={(files) => void handleFiles(files)}
          />
        )}
      </FormField>
      {folder !== null && (
        <p className="caption" aria-live="polite">
          {texts.importForm.folderSelected(folder.files.length, formatBytes(totalBytes, locale))}
        </p>
      )}
      {prefilled && <Alert variant="info">{texts.importForm.prefilled}</Alert>}
      <FormField id={`${ID_PREFIX}-id`} label={texts.form.idLabel} help={texts.form.idHelp} error={errors.id} disabled={saving}>
        {(control) => <Input {...control} mono value={assetId} maxLength={64} onChange={(event) => setAssetId(event.target.value)} />}
      </FormField>
      <SkillFields
        idPrefix={ID_PREFIX}
        values={values}
        errors={errors}
        disabled={saving}
        onChange={(change) => setValues((current) => ({ ...current, ...change }))}
        t={texts}
      />
      <FormField id={`${ID_PREFIX}-responsavel`} label={texts.form.ownerLabel} error={errors.owner} disabled={saving}>
        {(control) => <Input {...control} value={owner} maxLength={SKILL_OWNER_MAX} onChange={(event) => setOwner(event.target.value)} />}
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
