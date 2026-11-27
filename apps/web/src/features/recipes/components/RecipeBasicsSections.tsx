'use client';

import { Card, FormField, Input, Select, Textarea } from '@studio/ui';
import { LanguageSchema, type Language } from '@studio/shared/recipes';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { languageLabels } from '../recipe-labels';
import { recipeFieldIds, type RecipeFormValues } from '../recipe-form-model';

type Errors = Readonly<Record<string, string>>;

const languageOptions = LanguageSchema.options.map((language) => ({ value: language, label: languageLabels[language] }));

function isLanguage(value: string): value is Language {
  return LanguageSchema.safeParse(value).success;
}

export interface RecipeIdentitySectionProps {
  values: Pick<RecipeFormValues, 'name' | 'recipeId' | 'description' | 'owner'>;
  isNew: boolean;
  errors: Errors;
  onNameChange: (name: string) => void;
  onChange: (patch: Partial<RecipeFormValues>) => void;
}

/** design/telas/06 card "Identificação". */
export function RecipeIdentitySection({ values, isNew, errors, onNameChange, onChange }: RecipeIdentitySectionProps): ReactElement {
  const texts = useWebMessages().recipes.identity;
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.fieldGrid}>
          <FormField id={recipeFieldIds.name} label={texts.name} error={errors[recipeFieldIds.name]}>
            {(control) => <Input {...control} value={values.name} onChange={(event) => onNameChange(event.currentTarget.value)} />}
          </FormField>
          <FormField id={recipeFieldIds.recipeId} label={texts.id} help={texts.idHelp} error={errors[recipeFieldIds.recipeId]}>
            {(control) => (
              <Input
                {...control}
                mono
                spellCheck={false}
                autoComplete="off"
                readOnly={!isNew}
                value={values.recipeId}
                onChange={(event) => onChange({ recipeId: event.currentTarget.value, recipeIdEdited: true })}
              />
            )}
          </FormField>
          <FormField id={recipeFieldIds.owner} label={texts.owner} error={errors[recipeFieldIds.owner]}>
            {(control) => <Input {...control} autoComplete="name" value={values.owner} onChange={(event) => onChange({ owner: event.currentTarget.value })} />}
          </FormField>
          <FormField id={recipeFieldIds.description} label={texts.description} optional error={errors[recipeFieldIds.description]} className={layout.fieldWide}>
            {(control) => <Textarea {...control} rows={3} value={values.description} onChange={(event) => onChange({ description: event.currentTarget.value })} />}
          </FormField>
        </div>
      </Card>
    </fieldset>
  );
}

type NumberKey = 'width' | 'height' | 'fps' | 'durationMin' | 'durationMax' | 'integratedLufs' | 'truePeakDbtp';

const numberFields: readonly NumberKey[] = ['width', 'height', 'fps', 'durationMin', 'durationMax', 'integratedLufs', 'truePeakDbtp'];

function numberPatch(key: NumberKey, value: string): Partial<Pick<RecipeFormValues, NumberKey>> {
  const patch: Partial<Pick<RecipeFormValues, NumberKey>> = {};
  patch[key] = value;
  return patch;
}

export interface RecipeFormatSectionProps {
  values: Pick<RecipeFormValues, NumberKey | 'language'>;
  errors: Errors;
  onChange: (patch: Partial<RecipeFormValues>) => void;
}

/** design/telas/06 card "Formato". */
export function RecipeFormatSection({ values, errors, onChange }: RecipeFormatSectionProps): ReactElement {
  const texts = useWebMessages().recipes.format;
  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.fieldGrid}>
          {numberFields.map((key) => (
            <FormField key={key} id={recipeFieldIds[key]} label={texts[key]} error={errors[recipeFieldIds[key]]}>
              {(control) => (
                <Input
                  {...control}
                  inputMode={key === 'integratedLufs' || key === 'truePeakDbtp' ? 'text' : 'decimal'}
                  value={values[key]}
                  onChange={(event) => onChange(numberPatch(key, event.currentTarget.value))}
                />
              )}
            </FormField>
          ))}
          <FormField id={recipeFieldIds.language} label={texts.language} error={errors[recipeFieldIds.language]}>
            {(control) => (
              <Select
                {...control}
                options={languageOptions}
                value={values.language}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isLanguage(value)) onChange({ language: value });
                }}
              />
            )}
          </FormField>
        </div>
      </Card>
    </fieldset>
  );
}
