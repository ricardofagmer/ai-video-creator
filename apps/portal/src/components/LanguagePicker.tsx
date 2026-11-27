'use client';

import { Button, LOCALES, useI18n, type Locale } from '@studio/ui';
import type { ReactElement } from 'react';
import { usePortalMessages } from '@/messages';
import styles from './portal.module.css';

export interface LanguagePickerProps {
  onChange: (locale: Locale) => void;
}

/**
 * Language choice for this visit only. The kit's `LanguageSwitch` remembers the choice in a cookie,
 * and the portal sets no cookie, so this uses the kit's `Button` with `aria-pressed` instead.
 */
export function LanguagePicker({ onChange }: LanguagePickerProps): ReactElement {
  const { locale, ui } = useI18n();
  const t = usePortalMessages();
  return (
    <div role="group" aria-label={t.header.languageLabel} className={styles.languages}>
      {LOCALES.map((option) => (
        <Button
          key={option}
          variant={option === locale ? 'secondary' : 'ghost'}
          size="sm"
          lang={option}
          aria-pressed={option === locale}
          onClick={() => onChange(option)}
        >
          {ui.language.options[option]}
        </Button>
      ))}
    </div>
  );
}
