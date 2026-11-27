'use client';

import { FormField, Input, RadioGroup, Select, type RadioOption } from '@studio/ui';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import {
  TITLE_MAX_CHARS,
  comparisonFieldIds,
  type ComparisonChoice,
  type ComparisonChoiceErrors,
  type ComparisonChoiceField,
  type ComparisonKind,
  type SelectOption,
} from '../comparison-form-model';

/** The other versions of the bound asset, read when the owner picks a slot. */
export type CandidateVersions =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; options: readonly SelectOption[] }
  | { status: 'failed'; message: string };

interface ComparisonSubjectFieldsProps {
  choice: ComparisonChoice;
  errors: ComparisonChoiceErrors;
  slotOptions: readonly SelectOption[];
  candidates: CandidateVersions;
  recipeVersionOptions: readonly SelectOption[];
  disabled: boolean;
  onKindChange: (kind: ComparisonKind) => void;
  onSlotChange: (slot: string) => void;
  onChange: (field: Exclude<ComparisonChoiceField, 'slot'>, value: string) => void;
}

type SubjectFieldTexts = WebMessages['curations']['comparisons']['subjectFields'];

function kindOptionsOf(t: SubjectFieldTexts): readonly RadioOption<ComparisonKind>[] {
  return [
    { value: 'asset-binding', label: t.assetBinding, description: t.assetBindingDescription },
    { value: 'recipe-version', label: t.recipeVersion, description: t.recipeVersionDescription },
  ];
}

function candidatesHelp(candidates: CandidateVersions, t: SubjectFieldTexts): string | undefined {
  if (candidates.status === 'loading') return t.loadingVersions;
  if (candidates.status === 'failed') return candidates.message;
  if (candidates.status === 'ready' && candidates.options.length === 0) return t.noCandidates;
  return undefined;
}

/** "O que muda na versão B" of "Nova comparação": the subject of the comparison (B14) and its title. */
export function ComparisonSubjectFields({
  choice,
  errors,
  slotOptions,
  candidates,
  recipeVersionOptions,
  disabled,
  onKindChange,
  onSlotChange,
  onChange,
}: ComparisonSubjectFieldsProps): ReactElement {
  const t = useWebMessages().curations.comparisons.subjectFields;
  const candidateOptions = candidates.status === 'ready' ? candidates.options : [];
  return (
    <div className={layout.stack}>
      <RadioGroup name="comparacao-tipo" legend={t.legend} options={kindOptionsOf(t)} value={choice.kind} onChange={onKindChange} disabled={disabled} />
      {choice.kind === 'asset-binding' ? (
        <>
          <FormField id={comparisonFieldIds.slot} label={t.slot} error={errors.slot} disabled={disabled}>
            {({ invalid, ...control }) => (
              <Select
                {...control}
                invalid={invalid}
                placeholder={t.slotPlaceholder}
                options={slotOptions}
                value={choice.slot}
                onChange={(event) => onSlotChange(event.currentTarget.value)}
              />
            )}
          </FormField>
          {choice.slot !== '' && (
            <FormField
              id={comparisonFieldIds.assetRef}
              label={t.assetVersion}
              help={candidatesHelp(candidates, t)}
              error={errors.assetRef}
              disabled={disabled || candidates.status !== 'ready'}
            >
              {({ invalid, ...control }) => (
                <Select
                  {...control}
                  invalid={invalid}
                  placeholder={t.versionPlaceholder}
                  options={candidateOptions}
                  value={choice.assetRef}
                  onChange={(event) => onChange('assetRef', event.currentTarget.value)}
                />
              )}
            </FormField>
          )}
        </>
      ) : (
        <FormField
          id={comparisonFieldIds.recipeRef}
          label={t.recipeVersionField}
          help={recipeVersionOptions.length === 0 ? t.noRecipeVersions : undefined}
          error={errors.recipeRef}
          disabled={disabled}
        >
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              placeholder={t.versionPlaceholder}
              options={recipeVersionOptions}
              value={choice.recipeRef}
              onChange={(event) => onChange('recipeRef', event.currentTarget.value)}
            />
          )}
        </FormField>
      )}
      <FormField id={comparisonFieldIds.title} label={t.title} optional help={t.titleHelp} error={errors.title} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Input {...control} invalid={invalid} maxLength={TITLE_MAX_CHARS} value={choice.title} onChange={(event) => onChange('title', event.currentTarget.value)} />
        )}
      </FormField>
    </div>
  );
}
