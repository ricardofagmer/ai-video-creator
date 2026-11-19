'use client';

import { FormField, Input, RadioGroup, Select, type RadioOption } from '@studio/ui';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
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

const kindOptions: readonly RadioOption<ComparisonKind>[] = [
  {
    value: 'asset-binding',
    label: 'Outra versão de um ativo',
    description: 'A versão B troca só a versão do ativo de um vínculo da receita.',
  },
  { value: 'recipe-version', label: 'Outra versão da receita', description: 'A versão B roda outra versão da mesma receita.' },
];

function candidatesHelp(candidates: CandidateVersions): string | undefined {
  if (candidates.status === 'loading') return 'Carregando as versões…';
  if (candidates.status === 'failed') return candidates.message;
  if (candidates.status === 'ready' && candidates.options.length === 0) {
    return 'Nenhuma outra versão comparável: só versões em rascunho ou ativas, sem material biométrico.';
  }
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
  const candidateOptions = candidates.status === 'ready' ? candidates.options : [];
  return (
    <div className={layout.stack}>
      <RadioGroup name="comparacao-tipo" legend="O que muda" options={kindOptions} value={choice.kind} onChange={onKindChange} disabled={disabled} />
      {choice.kind === 'asset-binding' ? (
        <>
          <FormField id={comparisonFieldIds.slot} label="Vínculo" error={errors.slot} disabled={disabled}>
            {({ invalid, ...control }) => (
              <Select
                {...control}
                invalid={invalid}
                placeholder="Selecione o vínculo…"
                options={slotOptions}
                value={choice.slot}
                onChange={(event) => onSlotChange(event.currentTarget.value)}
              />
            )}
          </FormField>
          {choice.slot !== '' && (
            <FormField
              id={comparisonFieldIds.assetRef}
              label="Versão B do ativo"
              help={candidatesHelp(candidates)}
              error={errors.assetRef}
              disabled={disabled || candidates.status !== 'ready'}
            >
              {({ invalid, ...control }) => (
                <Select
                  {...control}
                  invalid={invalid}
                  placeholder="Selecione a versão…"
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
          label="Versão B da receita"
          help={recipeVersionOptions.length === 0 ? 'Esta receita não tem outra versão em rascunho ou ativa.' : undefined}
          error={errors.recipeRef}
          disabled={disabled}
        >
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              placeholder="Selecione a versão…"
              options={recipeVersionOptions}
              value={choice.recipeRef}
              onChange={(event) => onChange('recipeRef', event.currentTarget.value)}
            />
          )}
        </FormField>
      )}
      <FormField id={comparisonFieldIds.title} label="Título" optional help="Sem título, o serviço local escolhe um." error={errors.title} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Input {...control} invalid={invalid} maxLength={TITLE_MAX_CHARS} value={choice.title} onChange={(event) => onChange('title', event.currentTarget.value)} />
        )}
      </FormField>
    </div>
  );
}
