import { isLocalPortalUrl } from './portal-settings';

/** Electron `shell.openExternal`, injected so the guard below is testable. */
export type OpenExternal = (url: string) => Promise<void>;

/**
 * The portal module's only browser hand-off: an absolute `https:` URL, or the local portal's origin
 * page (plan section 9.6), re-parsed here so no other
 * scheme (`file:`, `javascript:`, a custom handler) can reach the system's URL dispatcher.
 */
export async function openHttpsExternal(url: string, openExternal: OpenExternal): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const localPortalPage = isLocalPortalUrl(parsed) && parsed.pathname === '/' && parsed.search === '';
  if (!localPortalPage && (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '')) return false;
  try {
    await openExternal(parsed.toString());
    return true;
  } catch {
    return false;
  }
}
