import { isHostAllowed } from '@ace/toolbox/dist/providers/media/capture-url';
import { chromium, type Page, type Route } from 'playwright';

export const NAVIGATION_TIMEOUT_MS = 30_000;

export class NavigationRefusedError extends Error {
  constructor(readonly host: string) {
    super(`navigation left the allowlist for ${host}`);
    this.name = 'NavigationRefusedError';
  }
}

export interface GuardedViewport {
  width: number;
  height: number;
}

/**
 * Opens the brief's page and hands the landed page to `read`. Every request, navigation or not,
 * must stay on the page's own https host (toolbox `isHostAllowed` also refuses local-network
 * addresses); redirects are checked before the browser follows them; WebSockets are closed
 * unopened. A fresh context: no profile, cookies, service workers or downloads. The context and
 * the browser are closed whatever `read` does.
 */
export async function withGuardedPage<T>(pageUrl: string, read: (page: Page) => Promise<T>, viewport?: GuardedViewport): Promise<T> {
  const url = new URL(pageUrl);
  const allowedHosts = [url.hostname.toLowerCase()];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: 'block',
      javaScriptEnabled: true,
      ...(viewport === undefined ? {} : { viewport, deviceScaleFactor: 1 }),
    });
    try {
      await context.route('**/*', async (route: Route) => {
        const target = new URL(route.request().url());
        if (!isHostAllowed(target, allowedHosts)) {
          await route.abort('blockedbyclient');
          return;
        }
        const response = await route.fetch({ maxRedirects: 0 });
        const location = response.headers()['location'];
        if (response.status() >= 300 && response.status() < 400 && location !== undefined) {
          const redirect = new URL(location, target);
          if (!isHostAllowed(redirect, allowedHosts)) {
            await route.abort('blockedbyclient');
            return;
          }
        }
        await route.fulfill({ response });
      });
      // `context.route` never sees WebSockets; close each before it connects (RFC 6455 1008, policy violation).
      await context.routeWebSocket(/.*/, (webSocket) => webSocket.close({ code: 1008, reason: 'blocked by page-text policy' }));
      const page = await context.newPage();
      await page.goto(url.href, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
      const landed = new URL(page.url());
      if (!isHostAllowed(landed, allowedHosts)) throw new NavigationRefusedError(landed.hostname);
      return await read(page);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
