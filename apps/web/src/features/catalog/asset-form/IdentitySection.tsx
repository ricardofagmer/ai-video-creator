'use client';

import { Card, FormField, Input, Select, Textarea } from '@studio/ui';
import { SensitivitySchema, type Sensitivity } from '@studio/shared/catalog';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { sensitivityLabels } from '../catalog-labels';
import { fieldIds, type AssetFormValues } from './asset-form-model';
import { type AssetFormTarget } from './asset-form-submit';
import { type FieldErrors } from './form-messages';

type IdentityValues = Pick<AssetFormValues, 'name' | 'assetId' | 'tags' | 'owner' | 'sensitivity' | 'notes'>;

export interface IdentitySectionProps {
  target: AssetFormTarget;
  values: IdentityValues;
  /** True when the previous version is biometric: new versions stay biometric (C10 `biometric-downgrade`). */
  sensitivityLocked: boolean;
  errors: FieldErrors;
  disabled: boolean;
  onNameChange: (name: string) => void;
  onChange: (patch: Partial<IdentityValues>) => void;
}

const sensitivityOptions = SensitivitySchema.options.map((sensitivity) => ({ value: sensitivity, label: sensitivityLabels[sensitivity] }));

function isSensitivity(value: string): value is Sensitivity {
  return SensitivitySchema.safeParse(value).success;
}

/** design/telas/04 card "Identificação". */
export function IdentitySection({ target, values, sensitivityLocked, errors, disabled, onNameChange, onChange }: IdentitySectionProps): ReactElement {
  return (
    <fieldset className={layout.fieldset} disabled={disabled}>
      <legend className="visually-hidden">Identificação</legend>
      <Card title="Identificação">
        <div className={layout.fieldGrid}>
          <FormField id={fieldIds.name} label="Nome" error={errors[fieldIds.name]}>
            {(control) => <Input {...control} value={values.name} onChange={(event) => onNameChange(event.currentTarget.value)} />}
          </FormField>
          <FormField id={fieldIds.assetId} label="Id" help="Letras minúsculas, números e hífens." error={errors[fieldIds.assetId]}>
            {(control) => (
              <Input
                {...control}
                mono
                spellCheck={false}
                autoComplete="off"
                readOnly={target.type === 'new-version'}
                value={values.assetId}
                onChange={(event) => onChange({ assetId: event.currentTarget.value })}
              />
            )}
          </FormField>
          <FormField id={fieldIds.tags} label="Etiquetas" optional help="Separadas por vírgula." error={errors[fieldIds.tags]}>
            {(control) => <Input {...control} value={values.tags} onChange={(event) => onChange({ tags: event.currentTarget.value })} />}
          </FormField>
          <FormField id={fieldIds.owner} label="Proprietário" error={errors[fieldIds.owner]}>
            {(control) => (
              <Input {...control} autoComplete="name" value={values.owner} onChange={(event) => onChange({ owner: event.currentTarget.value })} />
            )}
          </FormField>
          <FormField
            id={fieldIds.sensitivity}
            label="Sensibilidade"
            help={sensitivityLocked ? 'As novas versões de material biométrico continuam biométricas.' : undefined}
            error={errors[fieldIds.sensitivity]}
          >
            {(control) => (
              <Select
                {...control}
                disabled={sensitivityLocked || control.disabled}
                options={sensitivityOptions}
                value={values.sensitivity}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isSensitivity(value)) onChange({ sensitivity: value });
                }}
              />
            )}
          </FormField>
          <FormField id={fieldIds.notes} label="Notas" optional error={errors[fieldIds.notes]} className={layout.fieldWide}>
            {(control) => <Textarea {...control} value={values.notes} onChange={(event) => onChange({ notes: event.currentTarget.value })} />}
          </FormField>
        </div>
      </Card>
    </fieldset>
  );
}
