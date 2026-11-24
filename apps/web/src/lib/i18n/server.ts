import 'server-only';
import { LOCALE_COOKIE_NAME, resolveLocale, uiMessages, type Locale, type UiMessages } from '@studio/ui';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { webMessages, type WebMessages } from '@/messages';

export interface ServerI18n {
  locale: Locale;
  /** Texts of the web app. */
  t: WebMessages;
  /** Texts of the UI kit, for server components that pass them to kit components as props. */
  ui: UiMessages;
}

/** The request's language: `vs-locale` cookie, then `Accept-Language`, then pt-BR. */
export const getI18n = cache(async (): Promise<ServerI18n> => {
  const cookieValue = (await cookies()).get(LOCALE_COOKIE_NAME)?.value;
  const acceptLanguage = (await headers()).get('accept-language');
  const locale = resolveLocale(cookieValue, acceptLanguage);
  return { locale, t: webMessages[locale], ui: uiMessages[locale] };
});
