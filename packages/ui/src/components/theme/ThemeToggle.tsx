'use client';

import { useState, type ReactElement } from 'react';
import { THEME_COOKIE_NAME, themeAttribute, type ThemePreference } from './theme';
import styles from './ThemeToggle.module.css';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const OPTIONS: readonly { value: ThemePreference; label: string; icon: ReactElement }[] = [
  {
    value: 'system',
    label: 'Tema do sistema',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Tema claro',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Tema escuro',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    ),
  },
];

export interface ThemeToggleProps {
  /** The choice the server read from the cookie, so the first render matches `<html data-theme>`. */
  initialPreference: ThemePreference;
}

/** Three-way switch (system, light, dark). Applies the theme at once and remembers it in a cookie. */
export function ThemeToggle({ initialPreference }: ThemeToggleProps): ReactElement {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  function choose(next: ThemePreference): void {
    setPreference(next);
    const attribute = themeAttribute(next);
    if (attribute === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = attribute;
    document.cookie = `${THEME_COOKIE_NAME}=${next}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  }

  return (
    <div role="radiogroup" aria-label="Tema" className={styles.toggle}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          aria-label={option.label}
          title={option.label}
          className={styles.option}
          onClick={() => choose(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
