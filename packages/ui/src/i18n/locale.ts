/** Interface languages. pt-BR is the default and the source of truth of every catalogue. */
export type Locale = 'pt-BR' | 'es' | 'en';

export const LOCALES: readonly Locale[] = ['pt-BR', 'es', 'en'];

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Cookie that carries the choice, read on the server like `vs-theme`. */
export const LOCALE_COOKIE_NAME = 'vs-locale';

/** Narrows a raw cookie value; anything outside the allowlist is `undefined`. */
export function parseLocale(value: string | undefined): Locale | undefined {
  return LOCALES.find((locale) => locale === value);
}

const MAX_ACCEPT_LANGUAGE_LENGTH = 512;

/** Maps a primary language subtag to a supported locale; every other language is unsupported. */
function localeForSubtag(subtag: string): Locale | undefined {
  switch (subtag) {
    case 'pt':
      return 'pt-BR';
    case 'es':
      return 'es';
    case 'en':
      return 'en';
    default:
      return undefined;
  }
}

/**
 * Picks the first supported language of an `Accept-Language` header by descending q-weight
 * (ties keep header order). Allowlist only: `pt-PT` is Portuguese, so it gets pt-BR.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | undefined {
  if (acceptLanguage === null || acceptLanguage === undefined) return undefined;
  const ranges = acceptLanguage
    .slice(0, MAX_ACCEPT_LANGUAGE_LENGTH)
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const weightParam = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      const weight = weightParam === undefined ? 1 : Number(weightParam.slice(2));
      const subtag = tag.trim().toLowerCase().split('-')[0] ?? '';
      return { subtag, weight, index };
    })
    .filter((range) => Number.isFinite(range.weight) && range.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const range of ranges) {
    const locale = localeForSubtag(range.subtag);
    if (locale !== undefined) return locale;
  }
  return undefined;
}

/** Cookie first, then the browser's language, then pt-BR. */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null | undefined): Locale {
  return parseLocale(cookieValue) ?? negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}
