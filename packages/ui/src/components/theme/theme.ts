/** Theme choice of the owner: follow the operating system, or force one theme. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Cookie that carries the choice, so the server renders `data-theme` and the page never flashes. */
export const THEME_COOKIE_NAME = 'vs-theme';

const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Narrows a raw cookie value; anything unknown means "follow the system". */
export function parseThemePreference(value: string | undefined): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? 'system';
}

/** The `data-theme` attribute for `<html>`; "system" leaves it unset so `color-scheme` decides. */
export function themeAttribute(preference: ThemePreference): 'light' | 'dark' | undefined {
  return preference === 'system' ? undefined : preference;
}
