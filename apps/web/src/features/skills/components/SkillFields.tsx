'use client';

import { FormField, Input, Select, Textarea, formatBytes, type Locale } from '@studio/ui';
import type { ReactElement } from 'react';
import { maxUploadBytesByKind } from '@/features/catalog/upload-rules';
import { type WebMessages } from '@/messages';
import { skillCategories, skillCategoryFrom } from '../skill-categories';
import { type SkillFolderProblem } from '../skill-folder';
import { SKILL_BRIEFING_MAX, SKILL_NAME_MAX, type SkillFormInput, type SkillInputProblem } from '../skill-metadata';

/** Field errors of every Skills form, by field. */
export type SkillFieldErrors = Partial<Record<'id' | 'name' | 'briefing' | 'owner' | 'files', string>>;

export function skillFieldErrorsOf(problems: readonly SkillInputProblem[], t: WebMessages['skills']): SkillFieldErrors {
  const errors: SkillFieldErrors = {};
  for (const problem of problems) {
    if (problem === 'name-required') errors.name = t.form.errors.nameRequired;
    if (problem === 'briefing-too-long') errors.briefing = t.form.errors.briefingTooLong(SKILL_BRIEFING_MAX);
    if (problem === 'owner-required') errors.owner = t.form.errors.ownerRequired;
    if (problem === 'id-invalid') errors.id = t.form.errors.idInvalid;
  }
  return errors;
}

export function skillFolderProblemText(problem: SkillFolderProblem, t: WebMessages, locale: Locale): string {
  switch (problem.type) {
    case 'missing':
      return t.skills.form.errors.folderRequired;
    case 'entry-missing':
      return t.skills.form.errors.entryFileMissing;
    case 'size':
      return t.catalog.form.fileErrors.tooLarge(formatBytes(maxUploadBytesByKind.skill, locale));
    case 'mime':
      return t.catalog.form.fileErrors.typeNotAccepted(t.catalog.kinds.skill);
    case 'name':
      return t.catalog.form.fileErrors.badName(problem.fileName);
  }
}

interface SkillFieldsProps {
  idPrefix: string;
  values: SkillFormInput;
  errors: SkillFieldErrors;
  disabled: boolean;
  onChange: (change: Partial<SkillFormInput>) => void;
  t: WebMessages['skills'];
}

/** Name, briefing and category: the fields every Skills form shares. Values are plain text only. */
export function SkillFields({ idPrefix, values, errors, disabled, onChange, t }: SkillFieldsProps): ReactElement {
  const categoryOptions = skillCategories.map((value) => ({ value, label: t.categories[value] }));
  return (
    <>
      <FormField id={`${idPrefix}-nome`} label={t.form.nameLabel} error={errors.name} disabled={disabled}>
        {(control) => (
          <Input {...control} value={values.name} maxLength={SKILL_NAME_MAX} onChange={(event) => onChange({ name: event.target.value })} />
        )}
      </FormField>
      <FormField
        id={`${idPrefix}-resumo`}
        label={t.form.briefingLabel}
        help={t.form.briefingHelp(values.briefing.trim().length, SKILL_BRIEFING_MAX)}
        error={errors.briefing}
        disabled={disabled}
      >
        {(control) => <Textarea {...control} rows={3} value={values.briefing} onChange={(event) => onChange({ briefing: event.target.value })} />}
      </FormField>
      <FormField id={`${idPrefix}-categoria`} label={t.form.categoryLabel} disabled={disabled}>
        {(control) => (
          <Select
            {...control}
            options={categoryOptions}
            value={values.category}
            onChange={(event) => onChange({ category: skillCategoryFrom(event.target.value) ?? 'other' })}
          />
        )}
      </FormField>
    </>
  );
}
