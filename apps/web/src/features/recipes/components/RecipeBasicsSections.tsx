'use client';

import { Card, FormField, Input, Select, Textarea } from '@studio/ui';
import { LanguageSchema, type Language } from '@studio/shared/recipes';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatPresetIds, presetFormat, presetHasSize, presetOfSize, type FormatPresetId } from '@/features/wizard/wizard-format';
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

const PRESET_FIELD_ID = 'formato-sugerido';

function isPresetId(value: string): value is FormatPresetId {
  return formatPresetIds.some((id) => id === value);
}

/** The typed size as numbers; a half-typed field reads as 0 and matches no suggestion. */
function sizeOf(values: Pick<RecipeFormValues, 'width' | 'height' | 'fps'>): [number, number, number] {
  return [Number(values.width.trim()), Number(values.height.trim()), Number(values.fps.trim())];
}

/** design/telas/06 card "Formato", with the same suggested formats the "Criar vídeo" wizard offers. */
export function RecipeFormatSection({ values, errors, onChange }: RecipeFormatSectionProps): ReactElement {
  const messages = useWebMessages();
  const texts = messages.recipes.format;
  // The picked suggestion stays shown while the size still fits it ("Custom" always does).
  const [chosen, setChosen] = useState<FormatPresetId | null>(null);
  const size = sizeOf(values);
  const preset = chosen !== null && (chosen === 'custom' || presetHasSize(chosen, ...size)) ? chosen : presetOfSize(...size);

  function choosePreset(value: string): void {
    if (!isPresetId(value)) return;
    setChosen(value);
    if (value === 'custom') return;
    const format = presetFormat(value);
    onChange({ width: format.width, height: format.height, fps: format.fps });
  }

  return (
    <fieldset className={layout.fieldset}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.fieldGrid}>
          <FormField id={PRESET_FIELD_ID} label={texts.preset} help={texts.presetHelp} className={layout.fieldWide}>
            {(control) => (
              <Select
                {...control}
                options={formatPresetIds.map((id) => ({ value: id, label: messages.wizard.style.format.presets[id] }))}
                value={preset}
                onChange={(event) => choosePreset(event.currentTarget.value)}
              />
            )}
          </FormField>
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
