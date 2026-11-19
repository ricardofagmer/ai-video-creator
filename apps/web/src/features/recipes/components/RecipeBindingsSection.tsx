'use client';

import { BindingList, Card, Select, textLinkClassName, type BindingListItem } from '@studio/ui';
import Link from 'next/link';
import { type ReactElement } from 'react';
import { assetKindLabels } from '@/features/catalog/catalog-labels';
import layout from '@/features/common/layout.module.css';
import { BINDING_ID_PREFIX, bindingFieldId, type BindingOption } from '../recipe-form-model';
import { type SlotSpec } from '../recipe-slots';

export interface RecipeBindingsSectionProps {
  slots: readonly SlotSpec[];
  options: readonly BindingOption[];
  bindings: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
  onChange: (slot: string, ref: string) => void;
}

/**
 * design/telas/06 card "Vínculos": each slot pins one catalog version (`assetId@version` plus its
 * hash). Options list name and ref only; no asset content is fetched or previewed here.
 */
export function RecipeBindingsSection({ slots, options, bindings, errors, onChange }: RecipeBindingsSectionProps): ReactElement {
  const missingKinds = new Set(slots.filter((spec) => !options.some((option) => option.kind === spec.kind)).map((spec) => spec.kind));

  const items: BindingListItem[] = slots.map((spec) => {
    const choices = options.filter((option) => option.kind === spec.kind).map((option) => ({ value: option.ref, label: option.label }));
    const noActiveVersion = choices.length === 0;
    const error =
      errors[bindingFieldId(spec.slot)] ??
      (noActiveVersion && !spec.optional ? `Nenhuma versão ativa de ${assetKindLabels[spec.kind]} no catálogo.` : undefined);
    return {
      slot: spec.slot,
      label: spec.label,
      allowedKindsLabel: noActiveVersion
        ? `Aceita: ${assetKindLabels[spec.kind]} · nenhuma versão ativa no catálogo`
        : `Aceita: ${assetKindLabels[spec.kind]}`,
      optional: spec.optional,
      error,
      renderControl: (control) => (
        <Select
          {...control}
          options={spec.optional ? [{ value: '', label: 'Sem vínculo' }, ...choices] : choices}
          placeholder={spec.optional ? undefined : 'Escolha uma versão'}
          value={bindings[spec.slot] ?? ''}
          onChange={(event) => onChange(spec.slot, event.currentTarget.value)}
        />
      ),
    };
  });

  return (
    <Card>
      <div className={layout.stack}>
        <BindingList items={items} idPrefix={BINDING_ID_PREFIX} legend="Vínculos" />
        {missingKinds.size > 0 && (
          <p className="body-sm">
            Faltam versões ativas no catálogo.{' '}
            <Link href="/catalogo/novo" className={textLinkClassName()}>
              Enviar ativo
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}
