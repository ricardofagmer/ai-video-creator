/**
 * The languages the CLI speaks. The same three as the web (`@studio/ui` `Locale`), kept local
 * because the CLI does not depend on `@studio/ui`, whose index pulls in React components and CSS.
 */
export type CliLocale = 'pt-BR' | 'es' | 'en';

export const CLI_LOCALES: readonly CliLocale[] = ['pt-BR', 'es', 'en'];

/** pt-BR is the source language and the fallback when the system names no supported language. */
export const DEFAULT_CLI_LOCALE: CliLocale = 'pt-BR';

/** POSIX precedence: the first of these that is set (and not `C`/`POSIX`) names the language. */
const LOCALE_VARIABLES = ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const;

const LANGUAGE_LOCALES: Readonly<Record<string, CliLocale>> = { pt: 'pt-BR', es: 'es', en: 'en' };

/** `C`, `POSIX` and `C.UTF-8` mean "no language chosen", so the next variable is read. */
function isNeutralLocale(value: string): boolean {
  const upper = value.toUpperCase();
  return upper === 'C' || upper === 'POSIX' || upper.startsWith('C.') || upper.startsWith('POSIX.');
}

/**
 * The CLI language from the system locale variables (`LC_ALL`, then `LC_MESSAGES`, then `LANG`),
 * skipping blank values and `C`/`POSIX`. The first remaining value decides: its language part
 * (`pt_BR.UTF-8` -> `pt`) maps `pt` to pt-BR, `es` to es and `en` to en; any other language gives
 * pt-BR without reading the lower-precedence variables. Pure: the caller passes the environment.
 */
export function resolveSystemLocale(environment: Readonly<Record<string, string | undefined>>): CliLocale {
  for (const name of LOCALE_VARIABLES) {
    const value = environment[name]?.trim() ?? '';
    if (value === '' || isNeutralLocale(value)) continue;
    const language = value.split(/[_.@-]/u)[0]?.toLowerCase() ?? '';
    return LANGUAGE_LOCALES[language] ?? DEFAULT_CLI_LOCALE;
  }
  return DEFAULT_CLI_LOCALE;
}
