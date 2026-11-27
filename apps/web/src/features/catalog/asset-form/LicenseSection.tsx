'use client';

import { Card, Checkbox, FormField, Input, Select, Textarea } from '@studio/ui';
import { LicenseUseSchema, type LicenseUse } from '@studio/shared/catalog';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { fieldIds, type AssetFormValues, type ProvenanceOrigin } from './asset-form-model';
import { type FieldErrors } from './form-messages';

type LicenseValues = Pick<
  AssetFormValues,
  | 'sensitivity'
  | 'licenseName'
  | 'licenseUrl'
  | 'licenseReadOn'
  | 'licenseUses'
  | 'licenseTerms'
  | 'origin'
  | 'originUrl'
  | 'author'
  | 'capturedOn'
  | 'inheritedSource'
>;

export interface LicenseSectionProps {
  values: LicenseValues;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (patch: Partial<LicenseValues>) => void;
}

const originValues: readonly ProvenanceOrigin[] = ['none', 'url', 'created-here', 'inherited'];

function isOrigin(value: string): value is ProvenanceOrigin {
  return originValues.some((origin) => origin === value);
}

function originOptions(values: LicenseValues, t: WebMessages['catalog']['form']['license']['origins']): { value: ProvenanceOrigin; label: string }[] {
  const options: { value: ProvenanceOrigin; label: string }[] = [
    { value: 'none', label: t.none },
    { value: 'url', label: t.url },
    { value: 'created-here', label: t['created-here'] },
  ];
  // Seed and run origins are system-set; they can be kept on a new version but never chosen.
  if (values.inheritedSource !== null) options.push({ value: 'inherited', label: t.inherited });
  return options;
}

/** design/telas/04 card "Licença e procedência" (PRD 5.2; criterion 7 applies on activation). */
export function LicenseSection({ values, errors, disabled, onChange }: LicenseSectionProps): ReactElement {
  const catalogTexts = useWebMessages().catalog;
  const licenseUseLabels = catalogTexts.licenseUses;
  const texts = catalogTexts.form.license;

  function toggleUse(use: LicenseUse, checked: boolean): void {
    const next = checked ? [...values.licenseUses, use] : values.licenseUses.filter((candidate) => candidate !== use);
    onChange({ licenseUses: LicenseUseSchema.options.filter((option) => next.includes(option)) });
  }

  const usesErrorId = `${fieldIds.licenseUses}-error`;
  const description =
    values.sensitivity === 'third-party' ? texts.requiredForThirdParty : texts.optionalForOwn;

  return (
    <fieldset className={layout.fieldset} disabled={disabled}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title} description={description}>
        <div className={layout.fieldGrid}>
          <FormField id={fieldIds.licenseName} label={texts.name} optional error={errors[fieldIds.licenseName]}>
            {(control) => <Input {...control} value={values.licenseName} onChange={(event) => onChange({ licenseName: event.currentTarget.value })} />}
          </FormField>
          <FormField id={fieldIds.licenseUrl} label={texts.url} optional error={errors[fieldIds.licenseUrl]}>
            {(control) => (
              <Input {...control} type="url" inputMode="url" value={values.licenseUrl} onChange={(event) => onChange({ licenseUrl: event.currentTarget.value })} />
            )}
          </FormField>
          <FormField id={fieldIds.licenseReadOn} label={texts.readOn} optional error={errors[fieldIds.licenseReadOn]}>
            {(control) => (
              <Input {...control} type="date" value={values.licenseReadOn} onChange={(event) => onChange({ licenseReadOn: event.currentTarget.value })} />
            )}
          </FormField>
          <fieldset
            id={fieldIds.licenseUses}
            tabIndex={-1}
            className={`${layout.fieldset} ${layout.field} ${layout.fieldWide}`}
            aria-describedby={errors[fieldIds.licenseUses] === undefined ? undefined : usesErrorId}
          >
            <legend className="label">{texts.usesLegend}</legend>
            <div className={layout.inlineList}>
              {LicenseUseSchema.options.map((use) => (
                <Checkbox
                  key={use}
                  id={`${fieldIds.licenseUses}-${use}`}
                  label={licenseUseLabels[use]}
                  checked={values.licenseUses.includes(use)}
                  invalid={errors[fieldIds.licenseUses] !== undefined}
                  onChange={(event) => toggleUse(use, event.currentTarget.checked)}
                />
              ))}
            </div>
            {errors[fieldIds.licenseUses] !== undefined && (
              <p id={usesErrorId} className={layout.fieldError}>
                {errors[fieldIds.licenseUses]}
              </p>
            )}
          </fieldset>
          <FormField id={fieldIds.licenseTerms} label={texts.terms} optional error={errors[fieldIds.licenseTerms]} className={layout.fieldWide}>
            {(control) => <Textarea {...control} value={values.licenseTerms} onChange={(event) => onChange({ licenseTerms: event.currentTarget.value })} />}
          </FormField>
          <FormField id={fieldIds.origin} label={texts.origin} optional error={errors[fieldIds.origin]}>
            {(control) => (
              <Select
                {...control}
                options={originOptions(values, texts.origins)}
                value={values.origin}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isOrigin(value)) onChange({ origin: value });
                }}
              />
            )}
          </FormField>
          {values.origin === 'url' && (
            <FormField id={fieldIds.originUrl} label={texts.originUrl} error={errors[fieldIds.originUrl]}>
              {(control) => (
                <Input {...control} type="url" inputMode="url" value={values.originUrl} onChange={(event) => onChange({ originUrl: event.currentTarget.value })} />
              )}
            </FormField>
          )}
          <FormField id={fieldIds.author} label={texts.author} optional={values.origin === 'none'} error={errors[fieldIds.author]}>
            {(control) => <Input {...control} value={values.author} onChange={(event) => onChange({ author: event.currentTarget.value })} />}
          </FormField>
          <FormField id={fieldIds.capturedOn} label={texts.capturedOn} optional error={errors[fieldIds.capturedOn]}>
            {(control) => (
              <Input {...control} type="date" value={values.capturedOn} onChange={(event) => onChange({ capturedOn: event.currentTarget.value })} />
            )}
          </FormField>
        </div>
      </Card>
    </fieldset>
  );
}
