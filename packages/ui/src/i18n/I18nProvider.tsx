'use client';

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locale';
import { uiMessages, type UiMessages } from './messages';

export interface I18nContextValue {
  locale: Locale;
  ui: UiMessages;
}

const I18nContext = createContext<I18nContextValue>({ locale: DEFAULT_LOCALE, ui: uiMessages[DEFAULT_LOCALE] });

export interface I18nProviderProps {
  /** The locale the server resolved; only this id crosses to the client, the catalogues ship with the bundle. */
  locale: Locale;
  children: ReactNode;
}

/** Gives client components the active locale and the kit's texts. */
export function I18nProvider({ locale, children }: I18nProviderProps): ReactElement {
  const value = useMemo<I18nContextValue>(() => ({ locale, ui: uiMessages[locale] }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
