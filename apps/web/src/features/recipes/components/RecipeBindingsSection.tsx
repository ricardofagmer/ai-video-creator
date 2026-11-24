'use client';

import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { type Language } from '@studio/shared/recipes';
import { BindingList, Card, Select, textLinkClassName, type BindingListItem } from '@studio/ui';
import Link from 'next/link';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { useWebMessages } from '@/lib/i18n/client';
import { BINDING_ID_PREFIX, bindingFieldId, type BindingOption } from '../recipe-form-model';
import { type SlotSpec } from '../recipe-slots';

export interface RecipeBindingsSectionProps {
  slots: readonly SlotSpec[];
  options: readonly BindingOption[];
  bindings: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
  onChange: (slot: string, ref: string) => void;
  /** The recipe's language: the voice sample is spoken in it. */
  language: Language;
}

/**
 * design/telas/06 card "Vínculos": each slot pins one catalog version (`assetId@version` plus its
 * hash). Options list name and ref only; no asset content is fetched or previewed here.
 */
export function RecipeBindingsSection({ slots, options, bindings, errors, onChange, language }: RecipeBindingsSectionProps): ReactElement {
  const t = useWebMessages();
  const texts = t.recipes.bindings;
  const kindLabels = t.catalog.kinds;
  const missingKinds = new Set(slots.filter((spec) => !options.some((option) => option.kind === spec.kind)).map((spec) => spec.kind));

  const items: BindingListItem[] = slots.map((spec) => {
    const choices = options.filter((option) => option.kind === spec.kind).map((option) => ({ value: option.ref, label: option.label }));
    const noActiveVersion = choices.length === 0;
    const error =
      errors[bindingFieldId(spec.slot)] ??
      (noActiveVersion && !spec.optional ? texts.noActiveVersion(kindLabels[spec.kind]) : undefined);
    return {
      slot: spec.slot,
      label: texts.slots[spec.slot],
      allowedKindsLabel: noActiveVersion ? texts.acceptsNoActive(kindLabels[spec.kind]) : texts.accepts(kindLabels[spec.kind]),
      optional: spec.optional,
      error,
      renderControl: (control) => {
        const select = (
          <Select
            {...control}
            options={spec.optional ? [{ value: '', label: texts.none }, ...choices] : choices}
            placeholder={spec.optional ? undefined : texts.choose}
            value={bindings[spec.slot] ?? ''}
            onChange={(event) => onChange(spec.slot, event.currentTarget.value)}
          />
        );
        const voice = spec.slot === 'voice' ? heardVoiceOf(options, bindings[spec.slot] ?? '') : null;
        if (voice === null) return select;
        return (
          <div className={layout.row}>
            {select}
            <VoiceSampleButton assetId={voice.assetId} version={voice.version} name={voice.name} language={language} />
          </div>
        );
      },
    };
  });

  return (
    <Card>
      <div className={layout.stack}>
        <BindingList items={items} idPrefix={BINDING_ID_PREFIX} legend={texts.legend} />
        {missingKinds.size > 0 && (
          <p className="body-sm">
            {texts.missing}{' '}
            <Link href="/catalogo/novo" className={textLinkClassName()}>
              {texts.uploadAsset}
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}

interface HeardVoice {
  assetId: string;
  version: number;
  name: string;
}

/** The chosen voice slot option, when the api can make a sample of it; its label is the accessible name. */
function heardVoiceOf(options: readonly BindingOption[], ref: string): HeardVoice | null {
  const option = options.find((candidate) => candidate.ref === ref && candidate.kind === 'ai-model');
  if (option?.voice !== true || !AssetRefSchema.safeParse(ref).success) return null;
  return { ...parseAssetRef(ref), name: option.label };
}
