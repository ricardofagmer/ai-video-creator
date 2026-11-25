'use client';

import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { type MusicChoice, type Recipe } from '@studio/shared/recipes';
import { Alert, Card, FormField, RadioGroup, Select } from '@studio/ui';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { MusicChoiceFields } from '@/features/music/components/MusicChoiceFields';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { VoiceSampleButton } from '@/features/voices/components/VoiceSampleButton';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { basePinOf, chosenRefOf, musicChoiceOfRecipe, wizardSlotsOf, type WizardChoices, type WizardSlot, type WizardSlotSpec } from '../wizard-recipe';
import styles from '../wizard.module.css';

interface WizardStyleStepProps {
  base: Recipe;
  choices: WizardChoices;
  /** The owner's music choice; null shows the base recipe's. */
  musicChoice: MusicChoice | null;
  options: readonly BindingOption[];
  /** True when a pin differs from the base recipe's: "Iniciar" will save a new draft version. */
  changed: boolean;
  onChoose: (slot: WizardSlot, ref: string) => void;
  onMusicChoiceChange: (choice: MusicChoice) => void;
}

type StyleTexts = WebMessages['wizard']['style'];

/** The active options of one slot; the base recipe's own pin is marked so the owner sees the default. */
function slotOptions(spec: WizardSlotSpec, base: Recipe, options: readonly BindingOption[], texts: StyleTexts): { value: string; label: string }[] {
  const basePin = basePinOf(base, spec.slot)?.ref;
  const ofKind = options.filter((option) => option.kind === spec.kind && (spec.slot !== 'voice' || option.voice === true || option.ref === basePin));
  return ofKind.map((option) => ({ value: option.ref, label: option.ref === basePin ? texts.fromRecipe(option.label) : option.label }));
}

function slotLabel(slot: Exclude<WizardSlot, 'voice'>, texts: StyleTexts): string {
  if (slot === 'template') return texts.template;
  if (slot === 'brand-kit') return texts.brandKit;
  return texts.music;
}

/**
 * Step 3 "Voz e estilo": one voice, heard with "Ouvir" before choosing, one template and the
 * optional brand kit and music, among the active catalog versions. The base recipe's pins are
 * the defaults; slots of stages the recipe does not run are not offered. The music is either a
 * chosen song or "AI decides" with categories (docs/specs/2026-11-25-ai-music-choice-design.md).
 */
export function WizardStyleStep(props: WizardStyleStepProps): ReactElement {
  const { base, choices, musicChoice, options, changed, onChoose, onMusicChoiceChange } = props;
  const t = useWebMessages();
  const texts = t.wizard.style;
  const slots = wizardSlotsOf(base);
  const voiceSpec = slots.find((spec) => spec.slot === 'voice');
  const otherSpecs = slots.filter((spec): spec is WizardSlotSpec & { slot: Exclude<WizardSlot, 'voice'> } => spec.slot !== 'voice');

  return (
    <Card title={texts.card} description={texts.description}>
      <div className={layout.stack}>
        {voiceSpec === undefined ? (
          <p className="caption">{texts.noNarration}</p>
        ) : (
          <VoiceChoice spec={voiceSpec} base={base} choices={choices} options={options} texts={texts} onChoose={onChoose} />
        )}
        {otherSpecs.map((spec) => {
          const slotChoices = slotOptions(spec, base, options, texts);
          const id = `criar-${spec.slot}`;
          const field = (
            <FormField key={spec.slot} id={id} label={slotLabel(spec.slot, texts)} optional={spec.optional} help={slotChoices.length === 0 ? texts.noOptions : undefined}>
              {(control) => (
                <Select
                  {...control}
                  options={spec.optional ? [{ value: '', label: texts.none }, ...slotChoices] : slotChoices}
                  placeholder={spec.optional ? undefined : texts.choose}
                  value={chosenRefOf(base, choices, spec.slot, options)}
                  onChange={(event) => onChoose(spec.slot, event.currentTarget.value)}
                />
              )}
            </FormField>
          );
          if (spec.slot !== 'music') return field;
          return (
            <MusicChoiceFields
              key={spec.slot}
              name="criar-musica-modo"
              categoriesId="criar-musica-categorias"
              choice={musicChoice ?? musicChoiceOfRecipe(base)}
              onChange={onMusicChoiceChange}
              trackControl={field}
            />
          );
        })}
        {changed && <Alert variant="info">{texts.willSaveVersion(base.name)}</Alert>}
      </div>
    </Card>
  );
}

interface VoiceChoiceProps {
  spec: WizardSlotSpec;
  base: Recipe;
  choices: WizardChoices;
  options: readonly BindingOption[];
  texts: StyleTexts;
  onChoose: (slot: WizardSlot, ref: string) => void;
}

/** The voice as a radio group, then every voice that can be heard with its own "Ouvir" button. */
function VoiceChoice({ spec, base, choices, options, texts, onChoose }: VoiceChoiceProps): ReactElement {
  const voiceOptions = slotOptions(spec, base, options, texts);
  const chosen = chosenRefOf(base, choices, 'voice', options);
  const heard = options.filter((option) => option.kind === 'ai-model' && option.voice === true && AssetRefSchema.safeParse(option.ref).success);
  if (voiceOptions.length === 0) return <Alert variant="warning">{texts.noVoices}</Alert>;
  return (
    <div className={layout.stack}>
      <RadioGroup name="criar-voz" legend={texts.voiceLegend} options={voiceOptions} value={chosen === '' ? null : chosen} onChange={(ref) => onChoose('voice', ref)} />
      {heard.length > 0 && (
        <section aria-label={texts.listenTitle} className={layout.stack}>
          <p className="label">{texts.listenTitle}</p>
          <ul className={styles.rows}>
            {heard.map((option) => {
              const { assetId, version } = parseAssetRef(option.ref);
              return (
                <li key={option.ref} className={styles.row}>
                  <span className={styles.rowName}>{option.label}</span>
                  <VoiceSampleButton assetId={assetId} version={version} name={option.label} language={base.format.language} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
