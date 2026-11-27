'use client';

import { type Recipe } from '@studio/shared/recipes';
import { FormField, Input, Select } from '@studio/ui';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { formatOfRecipe, formatPresetIds, presetFormat, resolveFormat, type FormatPresetId, type WizardFormat } from '../wizard-format';

interface WizardFormatFieldsProps {
  base: Recipe;
  /** The owner's answer; null shows the base preset's format. */
  format: WizardFormat | null;
  onChange: (format: WizardFormat) => void;
}

type SizeField = 'width' | 'height' | 'fps';

const fieldIds: Readonly<Record<SizeField, string>> = {
  width: 'criar-formato-largura',
  height: 'criar-formato-altura',
  fps: 'criar-formato-fps',
};

function isPresetId(value: string): value is FormatPresetId {
  return formatPresetIds.some((id) => id === value);
}

/**
 * The video format: a suggested size for YouTube, Instagram, Facebook, TikTok or the traditional
 * 16:9, or "Custom" with width, height and fps typed. Only 16:9, 9:16 and 1:1 canvases are accepted.
 */
export function WizardFormatFields({ base, format, onChange }: WizardFormatFieldsProps): ReactElement {
  const t = useWebMessages();
  const texts = t.wizard.style.format;
  const shown = format ?? formatOfRecipe(base);
  const result = resolveFormat(shown);
  const problem = result.kind === 'invalid' ? result.problem : null;

  function choosePreset(value: string): void {
    if (!isPresetId(value)) return;
    onChange(value === 'custom' ? { ...shown, preset: 'custom' } : presetFormat(value));
  }

  function changeSize(field: SizeField, value: string): void {
    // A typed size is the owner's own: the field moves to "Custom" so the preset no longer claims it.
    onChange({ ...shown, preset: 'custom', [field]: value });
  }

  const sizeError = problem === 'size' ? texts.sizeInvalid : problem === 'aspect' ? texts.aspectInvalid : undefined;

  return (
    <section aria-label={texts.legend} className={layout.stack}>
      <FormField id="criar-formato" label={texts.legend} help={result.kind === 'valid' ? texts.summary(result.format.aspect, result.format.canvas.width, result.format.canvas.height, result.format.fps) : undefined}>
        {(control) => (
          <Select
            {...control}
            options={formatPresetIds.map((id) => ({ value: id, label: texts.presets[id] }))}
            value={shown.preset}
            onChange={(event) => choosePreset(event.currentTarget.value)}
          />
        )}
      </FormField>
      <div className={layout.fieldGrid}>
        <FormField id={fieldIds.width} label={texts.width} error={sizeError}>
          {({ invalid, ...control }) => (
            <Input {...control} type="number" inputMode="numeric" min={16} max={7680} invalid={invalid} value={shown.width} onChange={(event) => changeSize('width', event.currentTarget.value)} />
          )}
        </FormField>
        <FormField id={fieldIds.height} label={texts.height}>
          {({ invalid, ...control }) => (
            <Input {...control} type="number" inputMode="numeric" min={16} max={7680} invalid={invalid} value={shown.height} onChange={(event) => changeSize('height', event.currentTarget.value)} />
          )}
        </FormField>
        <FormField id={fieldIds.fps} label={texts.fps} error={problem === 'fps' ? texts.fpsInvalid : undefined}>
          {({ invalid, ...control }) => (
            <Input {...control} type="number" inputMode="numeric" min={1} max={120} invalid={invalid} value={shown.fps} onChange={(event) => changeSize('fps', event.currentTarget.value)} />
          )}
        </FormField>
      </div>
    </section>
  );
}
