/**
 * Fetch Metadata gate of the BFF (baseline review 2026-11-21). Browsers send `Sec-Fetch-Site` to
 * potentially trustworthy origins, and the web is served on loopback only (A9), so every browser
 * request reaching this proxy carries it. Answered: the web's own pages, `<video>` sources and
 * links (`same-origin`), and a URL the owner opened directly from the address bar or a bookmark
 * (`none`). Refused: `same-site`, which covers every other port on 127.0.0.1 (the api, a preview
 * server, any local tool), `cross-site`, and a missing header. No caller of the BFF omits it:
 * Server Components call the api directly (`src/lib/api/server.ts`), never this proxy.
 */
export function fetchSiteAllowed(secFetchSite: string | null): boolean {
  return secFetchSite === 'same-origin' || secFetchSite === 'none';
}
