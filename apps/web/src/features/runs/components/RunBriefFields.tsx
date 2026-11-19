'use client';

import { FormField, Input, Textarea } from '@studio/ui';
import { type Recipe } from '@studio/shared/recipes';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { asksKeyMessages, asksSourceUrl, durationBounds, newRunFieldIds, type NewRunErrors, type NewRunField, type NewRunFormValues } from '../new-run-model';

interface RunBriefFieldsProps {
  values: NewRunFormValues;
  errors: NewRunErrors;
  /** The chosen recipe; its `inputs` decide which optional fields show and are required. */
  recipe: Recipe | undefined;
  disabled: boolean;
  onChange: (field: NewRunField, value: string) => void;
}

/**
 * The brief fields of design/telas/07 (tema, URL de origem, mensagens-chave, duração alvo), shared
 * by "Nova execução" and "Nova comparação" so both build the same C2 `Brief` with `buildBrief`.
 */
export function RunBriefFields({ values, errors, recipe, disabled, onChange }: RunBriefFieldsProps): ReactElement {
  const bounds = recipe === undefined ? null : durationBounds(recipe);
  const keyMessageRange = recipe?.inputs.keyMessages;
  return (
    <div className={layout.stack}>
      <FormField id={newRunFieldIds.topic} label="Tema" error={errors.topic} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Input {...control} invalid={invalid} maxLength={300} value={values.topic} onChange={(event) => onChange('topic', event.currentTarget.value)} />
        )}
      </FormField>
      <FormField
        id={newRunFieldIds.sourceUrl}
        label="URL de origem"
        optional={recipe === undefined || !asksSourceUrl(recipe)}
        error={errors.sourceUrl}
        disabled={disabled}
      >
        {({ invalid, ...control }) => (
          <Input
            {...control}
            type="url"
            invalid={invalid}
            maxLength={2048}
            placeholder="https://…"
            value={values.sourceUrl}
            onChange={(event) => onChange('sourceUrl', event.currentTarget.value)}
          />
        )}
      </FormField>
      {recipe !== undefined && asksKeyMessages(recipe) && (
        <FormField
          id={newRunFieldIds.keyMessages}
          label="Mensagens-chave"
          optional={keyMessageRange?.min === 0}
          help="Uma por linha."
          error={errors.keyMessages}
          disabled={disabled}
        >
          {({ invalid, ...control }) => (
            <Textarea {...control} invalid={invalid} value={values.keyMessages} onChange={(event) => onChange('keyMessages', event.currentTarget.value)} />
          )}
        </FormField>
      )}
      <FormField
        id={newRunFieldIds.targetDurationSec}
        label="Duração alvo (segundos)"
        help={bounds === null ? undefined : `Entre ${bounds.min} e ${bounds.max} segundos.`}
        error={errors.targetDurationSec}
        disabled={disabled}
      >
        {({ invalid, ...control }) => (
          <Input
            {...control}
            type="number"
            inputMode="numeric"
            invalid={invalid}
            min={bounds?.min}
            max={bounds?.max}
            value={values.targetDurationSec}
            onChange={(event) => onChange('targetDurationSec', event.currentTarget.value)}
          />
        )}
      </FormField>
    </div>
  );
}
