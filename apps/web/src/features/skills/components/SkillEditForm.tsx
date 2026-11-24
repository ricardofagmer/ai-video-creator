'use client';

import { Alert, FormField, Textarea, UploadDropzone, buttonClassName, formatBytes, useI18n } from '@studio/ui';
import { ENTRY_FILE_TEXT_MAX_BYTES, type AssetVersionView, type EntryFileView } from '@studio/shared/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { useModalFormBridge } from '@/features/common/modal-form-bridge';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { skillCategoryOf } from '../skill-categories';
import { skillFolderOf, type SkillFolder } from '../skill-folder';
import { skillsHref } from '../skill-list';
import {
  SKILL_ENTRY_FILE,
  editedSkillMetadataOf,
  skillDescriptionOf,
  skillEntryFileOf,
  skillInputProblems,
  type SkillFormInput,
} from '../skill-metadata';
import styles from '../skills.module.css';
import { SkillFields, skillFieldErrorsOf, skillFolderProblemText, type SkillFieldErrors } from './SkillFields';

const ID_PREFIX = 'skill-editar';

interface SkillEditFormProps {
  base: AssetVersionView;
  /** The SKILL.md text of `base`, or null when the api cannot offer it as text. */
  entryFile: EntryFileView | null;
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Edit a skill's name, briefing, category and SKILL.md text, and optionally replace its folder. Every
 * save is version N+1 as a draft; the fields the form does not show are carried over from `base`. An
 * edited SKILL.md text is sent with the metadata save and the api keeps every other file by hash.
 */
export function SkillEditForm({ base, entryFile }: SkillEditFormProps): ReactElement {
  const t = useWebMessages();
  const texts = t.skills;
  const { locale } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState<SkillFormInput>({
    name: base.name,
    briefing: skillDescriptionOf(base),
    category: skillCategoryOf(base),
  });
  const [folder, setFolder] = useState<SkillFolder | null>(null);
  const [entryText, setEntryText] = useState(entryFile?.text ?? '');
  const [entryTextError, setEntryTextError] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<SkillFieldErrors>({});
  // The api writes a changed SKILL.md into the studio store only, so a referenced folder stays read-only.
  const entryEditable = entryFile !== null && base.storage.mode === 'store';
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty =
    folder !== null ||
    entryText !== (entryFile?.text ?? '') ||
    values.name !== base.name ||
    values.briefing !== skillDescriptionOf(base) ||
    values.category !== skillCategoryOf(base);
  // Inside the Skills modal: closing asks first while dirty; a save navigates to the list, which closes it.
  const modal = useModalFormBridge(dirty && !saving);

  useEffect(() => {
    if (!dirty || saving) return undefined;
    const confirmLeave = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [dirty, saving]);

  function handleFiles(files: File[]): void {
    const result = skillFolderOf(files);
    if (result.status === 'problem') {
      setFolder(null);
      setErrors((current) => ({ ...current, files: skillFolderProblemText(result.problem, t, locale) }));
      return;
    }
    setFolder(result.folder);
    setErrors((current) => ({ ...current, files: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fieldErrors = skillFieldErrorsOf(skillInputProblems(values), texts);
    const entryChanged = folder === null && entryFile !== null && entryEditable && entryText !== entryFile.text;
    const tooLarge = entryChanged && utf8Bytes(entryText) > ENTRY_FILE_TEXT_MAX_BYTES;
    setErrors(fieldErrors);
    setEntryTextError(tooLarge ? texts.edit.entryFileTooLarge : undefined);
    setFormError(null);
    if (Object.keys(fieldErrors).length > 0 || tooLarge) return;

    setSaving(true);
    try {
      if (folder === null) {
        const metadata = editedSkillMetadataOf(base, values, skillEntryFileOf(base));
        await browserStudioClient.saveMetadataVersion(base.id, {
          fromVersion: base.version,
          metadata,
          ...(entryChanged ? { entryFile: { text: entryText } } : {}),
        });
      } else {
        const metadata = editedSkillMetadataOf(base, values, SKILL_ENTRY_FILE);
        await browserStudioClient.saveAssetVersion(base.id, { fields: { metadata }, content: { layout: 'folder', files: folder.files } });
      }
      router.push(skillsHref(values.category, base.id));
    } catch (error) {
      setFormError(describeApiError(error, t));
      setSaving(false);
    }
  }

  const totalBytes = folder?.files.reduce((sum, item) => sum + item.file.size, 0) ?? 0;

  return (
    <form className={layout.form} onSubmit={handleSubmit} noValidate>
      <p className="caption">{texts.edit.basedOn(base.version)}</p>
      <SkillFields
        idPrefix={ID_PREFIX}
        values={values}
        errors={errors}
        disabled={saving}
        onChange={(change) => setValues((current) => ({ ...current, ...change }))}
        t={texts}
      />
      {entryFile === null ? (
        <Alert variant="warning">{texts.edit.entryFileUnavailable}</Alert>
      ) : (
        <FormField
          id={`${ID_PREFIX}-skill-md`}
          label={texts.edit.entryFileLabel(entryFile.path)}
          help={entryEditable ? texts.edit.entryFileHelp : texts.edit.entryFileReadOnly}
          error={entryTextError}
          disabled={saving || folder !== null}
        >
          {(control) => (
            <Textarea
              {...control}
              className={styles.bodyInput}
              rows={16}
              value={entryText}
              readOnly={!entryEditable}
              onChange={(event) => setEntryText(event.target.value)}
            />
          )}
        </FormField>
      )}
      {entryEditable && folder !== null && <p className="caption">{texts.edit.entryFileReplacedByFolder}</p>}
      <FormField id={`${ID_PREFIX}-pasta`} label={texts.edit.replaceFilesLabel} error={errors.files} optional disabled={saving}>
        {(control) => (
          <UploadDropzone
            id={control.id}
            aria-describedby={control['aria-describedby']}
            invalid={control.invalid}
            disabled={saving}
            allowFolder
            multiple
            hint={texts.edit.replaceFilesHint}
            onFiles={handleFiles}
          />
        )}
      </FormField>
      {folder !== null && (
        <p className="caption" aria-live="polite">
          {texts.importForm.folderSelected(folder.files.length, formatBytes(totalBytes, locale))}{' '}
          <button type="button" className={buttonClassName({ variant: 'ghost' })} onClick={() => setFolder(null)} disabled={saving}>
            {texts.edit.clearFiles}
          </button>
        </p>
      )}
      {formError !== null && <Alert variant="error">{formError}</Alert>}
      <div className={layout.formFooter}>
        <button type="submit" className={buttonClassName({ variant: 'primary' })} disabled={saving} aria-busy={saving}>
          {saving ? texts.form.saving : texts.form.save}
        </button>
        {modal === null ? (
          <Link href="/skills" className={buttonClassName({ variant: 'secondary' })}>
            {texts.form.cancel}
          </Link>
        ) : (
          <button type="button" className={buttonClassName({ variant: 'secondary' })} onClick={() => modal.close()}>
            {texts.form.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
