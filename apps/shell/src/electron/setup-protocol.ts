import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { protocol } from 'electron';

/*
 * The setup window's page lives in app.asar, and the packaged app turns the
 * GrantFileProtocolExtraPrivileges fuse off (ADR 0005), so `file://` cannot read it. This scheme
 * serves exactly the window's two files from beside the bundled main through the main process:
 * a closed list, GET only, no path from the request ever reaches the disk.
 */
const SETUP_SCHEME = 'studio-setup';
const SETUP_HOST = 'window';

const SETUP_FILES: Readonly<Record<string, string>> = {
  '/setup.html': 'text/html; charset=utf-8',
  '/setup.css': 'text/css; charset=utf-8',
};

export const SETUP_PAGE_URL = `${SETUP_SCHEME}://${SETUP_HOST}/setup.html`;

/** Must run before `ready`: a standard, secure scheme so the page's `style-src 'self'` covers setup.css. */
export function registerSetupScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SETUP_SCHEME, privileges: { standard: true, secure: true } }]);
}

/** Must run after `ready`. `setupHtmlFile` is the bundled `setup.html`; `setup.css` sits beside it. */
export function serveSetupFiles(setupHtmlFile: string): void {
  const folder = dirname(setupHtmlFile);
  protocol.handle(SETUP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const contentType = url.host === SETUP_HOST ? SETUP_FILES[url.pathname] : undefined;
    if (request.method !== 'GET' || contentType === undefined) return new Response(null, { status: 404 });
    const body = await readFile(join(folder, url.pathname.slice(1)));
    return new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' } });
  });
}
