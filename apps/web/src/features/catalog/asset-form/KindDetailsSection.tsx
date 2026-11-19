'use client';

import { Card, FormField, Input, Select, Textarea, type FieldControlProps } from '@studio/ui';
import { type AssetKind } from '@studio/shared/catalog';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { type FieldErrors } from './form-messages';
import { detailFieldSpecs, type DetailFieldSpec } from './kind-detail-fields';
import { detailFieldId, VARIABLES_FIELD_ID, type DetailFields, type PromptVariableRow } from './kind-details-model';
import { PromptVariablesEditor } from './PromptVariablesEditor';

export interface KindDetailsSectionProps {
  kind: AssetKind;
  fields: DetailFields;
  variables: readonly PromptVariableRow[];
  errors: FieldErrors;
  disabled: boolean;
  onFieldChange: (key: string, value: string) => void;
  onVariablesChange: (rows: PromptVariableRow[]) => void;
}

function DetailControl({
  spec,
  value,
  control,
  onChange,
}: {
  spec: DetailFieldSpec;
  value: string;
  control: FieldControlProps;
  onChange: (value: string) => void;
}): ReactElement {
  switch (spec.control) {
    case 'select':
      return <Select {...control} options={spec.options ?? []} value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'textarea':
      return <Textarea {...control} value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'json':
      return <Textarea {...control} className="mono" rows={8} spellCheck={false} value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'number':
      return <Input {...control} inputMode="decimal" value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'mono':
      return <Input {...control} mono spellCheck={false} value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
    case 'text':
      return <Input {...control} value={value} onChange={(event) => onChange(event.currentTarget.value)} />;
  }
}

/** design/telas/04 card "Campos do tipo" (PRD 5.2 kind-specific fields). */
export function KindDetailsSection({ kind, fields, variables, errors, disabled, onFieldChange, onVariablesChange }: KindDetailsSectionProps): ReactElement {
  return (
    <fieldset className={layout.fieldset} disabled={disabled}>
      <legend className="visually-hidden">Campos do tipo</legend>
      <Card title="Campos do tipo">
        {kind === 'prompt' ? (
          <PromptVariablesEditor rows={variables} onChange={onVariablesChange} error={errors[VARIABLES_FIELD_ID]} disabled={disabled} />
        ) : (
          <div className={layout.fieldGrid}>
            {detailFieldSpecs[kind].map((spec) => {
              const id = detailFieldId(spec.key);
              return (
                <FormField
                  key={spec.key}
                  id={id}
                  label={spec.label}
                  help={spec.help}
                  error={errors[id]}
                  optional={spec.optional}
                  className={spec.wide === true ? layout.fieldWide : undefined}
                >
                  {(control) => <DetailControl spec={spec} value={fields[spec.key] ?? ''} control={control} onChange={(value) => onFieldChange(spec.key, value)} />}
                </FormField>
              );
            })}
          </div>
        )}
      </Card>
    </fieldset>
  );
}
