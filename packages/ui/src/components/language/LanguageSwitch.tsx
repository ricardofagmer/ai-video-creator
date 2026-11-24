'use client';

import { useState, type ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { LOCALES, LOCALE_COOKIE_NAME, type Locale } from '../../i18n/locale';
import { LanguageFlag } from './LanguageFlag';
import styles from './LanguageSwitch.module.css';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface LanguageSwitchProps {
  /** Runs after the cookie is written, for example `router.refresh()` so the server re-renders the page. */
  onChanged?: (locale: Locale) => void;
}

/**
 * Three-way language switch (pt-BR, es, en). Each option shows a flag; the language's own name
 * is the accessible name and the tooltip. Remembers the choice in a cookie, like the theme.
 */
export function LanguageSwitch({ onChanged }: LanguageSwitchProps): ReactElement {
  const { locale, ui } = useI18n();
  const [selected, setSelected] = useState<Locale>(locale);

  function choose(next: Locale): void {
    setSelected(next);
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    onChanged?.(next);
  }

  return (
    <div role="radiogroup" aria-label={ui.language.groupLabel} className={styles.switch}>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          lang={option}
          aria-checked={selected === option}
          aria-label={ui.language.options[option]}
          title={ui.language.options[option]}
          className={styles.option}
          onClick={() => choose(option)}
        >
          <LanguageFlag locale={option} className={styles.flag} />
        </button>
      ))}
    </div>
  );
}
