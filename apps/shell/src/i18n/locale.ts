/** Menu languages, the same three the web offers. pt-BR is the source of every label. */
export type ShellLocale = 'pt-BR' | 'es' | 'en';

export const DEFAULT_SHELL_LOCALE: ShellLocale = 'pt-BR';

/** Maps one BCP 47 or POSIX tag (`pt-PT`, `es_MX.UTF-8`, `en`) to a menu language, or null. */
export function shellLocaleOf(tag: string): ShellLocale | null {
  const language = tag.trim().toLowerCase().split(/[-_.@]/)[0] ?? '';
  if (language === 'pt') return 'pt-BR';
  if (language === 'es') return 'es';
  if (language === 'en') return 'en';
  return null;
}

/**
 * The menu language from the Mac's preferred languages, in order (Electron
 * `app.getPreferredSystemLanguages()`): the first supported one, else pt-BR. The list is untrusted
 * input, so anything unknown is skipped and nothing here throws.
 */
export function resolveShellLocale(preferred: readonly string[]): ShellLocale {
  for (const tag of preferred) {
    const locale = shellLocaleOf(tag);
    if (locale !== null) return locale;
  }
  return DEFAULT_SHELL_LOCALE;
}
