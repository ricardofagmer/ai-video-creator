'use client';

import { MUSIC_CATEGORIES_MAX } from '@studio/shared/catalog';
import { type MusicChoice } from '@studio/shared/recipes';
import { RadioGroup } from '@studio/ui';
import { type ReactElement, type ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { MusicCategoryPicker } from './MusicCategoryPicker';

type MusicMode = MusicChoice['mode'];

export interface MusicChoiceFieldsProps {
  /** Name of the two radio inputs, unique on the page. */
  name: string;
  /** Id of the category fieldset shown in "AI decides". */
  categoriesId: string;
  choice: MusicChoice;
  onChange: (choice: MusicChoice) => void;
  /** What "Choose the song" shows: the screen's own song select and its "Listen" button, unchanged. */
  trackControl: ReactNode;
}

/**
 * "Choose the song" or "AI decides" (docs/specs/2026-11-25-ai-music-choice-design.md section 5).
 * The song picker shows only for the first; the second shows the categories, none meaning any.
 */
export function MusicChoiceFields({ name, categoriesId, choice, onChange, trackControl }: MusicChoiceFieldsProps): ReactElement {
  const texts = useWebMessages().catalog.musicChoice;
  const options: { value: MusicMode; label: string; description: string }[] = [
    { value: 'track', label: texts.track, description: texts.trackDescription },
    { value: 'auto', label: texts.auto, description: texts.autoDescription },
  ];

  return (
    <div className={layout.stack}>
      <RadioGroup<MusicMode>
        name={name}
        legend={texts.modeLegend}
        options={options}
        value={choice.mode}
        inline
        onChange={(mode) => onChange(mode === 'track' ? { mode: 'track' } : { mode: 'auto', categories: [] })}
      />
      {choice.mode === 'track' ? (
        trackControl
      ) : (
        <MusicCategoryPicker
          idPrefix={categoriesId}
          legend={texts.categoriesLegend}
          help={texts.autoHelp(MUSIC_CATEGORIES_MAX)}
          value={choice.categories}
          onChange={(categories) => onChange({ mode: 'auto', categories })}
        />
      )}
    </div>
  );
}
