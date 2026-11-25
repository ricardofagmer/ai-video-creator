'use client';

import { MUSIC_CATEGORIES_MAX, musicCategories, type MusicCategory } from '@studio/shared/catalog';
import { Checkbox } from '@studio/ui';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import styles from './MusicCategoryPicker.module.css';

export interface MusicCategoryPickerProps {
  /** Id of the fieldset; each box is `{idPrefix}-{category}`. Unique on the page. */
  idPrefix: string;
  legend: string;
  /** Shown under the legend while fewer than the maximum are ticked. */
  help: string;
  value: readonly MusicCategory[];
  onChange: (categories: MusicCategory[]) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * The music categories as checkboxes (docs/specs/2026-11-25-ai-music-choice-design.md section 1),
 * at most `MUSIC_CATEGORIES_MAX`: once full, the unticked boxes are off until one is unticked.
 * The answer keeps the shared list's order, so the same choice always saves the same params.
 */
export function MusicCategoryPicker({ idPrefix, legend, help, value, onChange, error, disabled = false }: MusicCategoryPickerProps): ReactElement {
  const texts = useWebMessages().catalog.musicChoice;
  const chosen = new Set(value);
  const full = chosen.size >= MUSIC_CATEGORIES_MAX;
  const helpId = `${idPrefix}-ajuda`;
  const errorId = `${idPrefix}-erro`;

  function toggle(category: MusicCategory, checked: boolean): void {
    const next = new Set(chosen);
    if (checked) next.add(category);
    else next.delete(category);
    onChange(musicCategories.filter((candidate) => next.has(candidate)).slice(0, MUSIC_CATEGORIES_MAX));
  }

  return (
    <fieldset id={idPrefix} tabIndex={-1} className={layout.fieldset} disabled={disabled} aria-describedby={error === undefined ? helpId : `${helpId} ${errorId}`}>
      <legend className={`label ${styles.legend}`}>{legend}</legend>
      <div className={styles.body}>
        <p id={helpId} className="caption" aria-live="polite">
          {full ? texts.limitReached(MUSIC_CATEGORIES_MAX) : help}
        </p>
        <div className={layout.checkGrid}>
          {musicCategories.map((category) => (
            <Checkbox
              key={category}
              id={`${idPrefix}-${category}`}
              label={texts.categories[category]}
              checked={chosen.has(category)}
              disabled={full && !chosen.has(category)}
              invalid={error !== undefined}
              onChange={(event) => toggle(category, event.currentTarget.checked)}
            />
          ))}
        </div>
        {error !== undefined && (
          <p id={errorId} className={layout.fieldError}>
            {error}
          </p>
        )}
      </div>
    </fieldset>
  );
}
