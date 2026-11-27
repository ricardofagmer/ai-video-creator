'use client';

import { Card, FormField, Input, Select, TagInput, Textarea, useI18n } from '@studio/ui';
import { SensitivitySchema, type Sensitivity } from '@studio/shared/catalog';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { ImageCategoryPicker } from '../components/ImageCategoryPicker';
import { imageCategoryOfTags, tagsWithImageCategory } from '../image-categories';
import { fieldIds, tagsOf, type AssetFormValues } from './asset-form-model';
import { type AssetFormTarget } from './asset-form-submit';
import { type FieldErrors } from './form-messages';

type IdentityValues = Pick<AssetFormValues, 'kind' | 'name' | 'assetId' | 'tags' | 'owner' | 'sensitivity' | 'notes'>;

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

function isSensitivity(value: string): value is Sensitivity {
  return SensitivitySchema.safeParse(value).success;
}

/** design/telas/04 card "Identificação". */
export function IdentitySection({ target, values, sensitivityLocked, errors, disabled, onNameChange, onChange }: IdentitySectionProps): ReactElement {
  const messages = useWebMessages();
  const texts = messages.catalog.form.identity;
  const { ui } = useI18n();
  const sensitivityOptions = SensitivitySchema.options.map((sensitivity) => ({ value: sensitivity, label: ui.status.sensitivity[sensitivity] }));
  return (
    <fieldset className={layout.fieldset} disabled={disabled}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.fieldGrid}>
          <FormField id={fieldIds.name} label={texts.name} error={errors[fieldIds.name]}>
            {(control) => <Input {...control} value={values.name} onChange={(event) => onNameChange(event.currentTarget.value)} />}
          </FormField>
          <FormField id={fieldIds.assetId} label={texts.id} help={texts.idHelp} error={errors[fieldIds.assetId]}>
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
          <FormField id={fieldIds.tags} label={texts.tags} optional help={texts.tagsHelp} error={errors[fieldIds.tags]}>
            {(control) => (
              <TagInput {...control} separator="comma" removeLabel={messages.common.tagInput.remove} value={values.tags} onChange={(tags) => onChange({ tags })} />
            )}
          </FormField>
          {values.kind === 'image' && (
            // The category lives in the tags as `cat.<slug>` (docs/specs/2026-11-24-catalog-image-categories.md).
            <ImageCategoryPicker
              idPrefix="imagem-envio"
              value={imageCategoryOfTags(tagsOf(values.tags))}
              onChange={(category) => onChange({ tags: tagsWithImageCategory(tagsOf(values.tags), category).join(', ') })}
              disabled={disabled}
            />
          )}
          <FormField id={fieldIds.owner} label={texts.owner} error={errors[fieldIds.owner]}>
            {(control) => (
              <Input {...control} autoComplete="name" value={values.owner} onChange={(event) => onChange({ owner: event.currentTarget.value })} />
            )}
          </FormField>
          <FormField
            id={fieldIds.sensitivity}
            label={texts.sensitivity}
            help={sensitivityLocked ? texts.sensitivityLocked : undefined}
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
          <FormField id={fieldIds.notes} label={texts.notes} optional error={errors[fieldIds.notes]} className={layout.fieldWide}>
            {(control) => <Textarea {...control} value={values.notes} onChange={(event) => onChange({ notes: event.currentTarget.value })} />}
          </FormField>
        </div>
      </Card>
    </fieldset>
  );
}
