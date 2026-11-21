import { PlatformSchema, type Platform } from '@studio/shared/metrics';

/*
 * The callback's redirect (`/contas?resultado=...&motivo=...`) names no platform, so the tab
 * remembers which one it left for. Only the platform name is kept: never a URL, a `state` or a code.
 * `sessionStorage` is per tab and per origin, and the connect navigates this same tab.
 */
const CONNECTING_PLATFORM_KEY = 'studio.contas.conectando';

/** Called right before the tab navigates to the authorize URL. */
export function rememberConnectingPlatform(platform: Platform): void {
  try {
    window.sessionStorage.setItem(CONNECTING_PLATFORM_KEY, platform);
  } catch {
    // Storage disabled: the result notice then speaks of "a plataforma" instead of its name.
    return;
  }
}

/**
 * The platform this tab last left for; null when unknown or unreadable. Not removed on read, so a
 * repeated effect still finds it; the next connect overwrites it.
 */
export function readConnectingPlatform(): Platform | null {
  try {
    const stored = window.sessionStorage.getItem(CONNECTING_PLATFORM_KEY);
    const parsed = PlatformSchema.safeParse(stored);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
