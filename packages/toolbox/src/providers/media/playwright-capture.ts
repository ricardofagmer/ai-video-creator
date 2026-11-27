import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type APIResponse, type Browser, type Route } from 'playwright';
import { BlockedError, type CaptureResult } from '@studio/shared/ace';
import type { CaptureViewport } from '../../config/env';
import { ProviderError } from '../../errors';
import { isHostAllowed, isPublicHttpsUrl } from './capture-url';

const MAX_RECORDING_S = 20;
const MIN_RECORDING_S = 2;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SCROLL_STEP_PX = 240;
/** RFC 6455 "policy violation": the page asked for a WebSocket, which captures never open. */
const WEBSOCKET_POLICY_CLOSE = 1008;
const viewports: Record<CaptureViewport, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  vertical: { width: 1080, height: 1920 },
};

export interface LiveCaptureRequest {
  url: URL;
  durationS: number;
  allowedHosts: readonly string[];
  viewport: CaptureViewport;
}

/**
 * Decides one routed request of a capture. Navigations (main frame, iframes) must stay on the
 * https allowlist; every other request (images, scripts, fetch/XHR, media) must be public https.
 * Each redirect hop is checked by the same rule before the browser sees it, because a route
 * handler only sees the first URL of a chain. Refused navigation hosts are appended to `refused`.
 */
async function guardCaptureRoute(route: Route, allowedHosts: readonly string[], refused: string[]): Promise<void> {
  const target = route.request();
  const isNavigation = target.isNavigationRequest();
  // A sub-request to the allowlisted host itself is the page's own asset (the only way a local page loads any).
  const permitted = (url: URL): boolean => isHostAllowed(url, allowedHosts) || (!isNavigation && isPublicHttpsUrl(url));
  const targetUrl = new URL(target.url());
  if (!permitted(targetUrl)) {
    if (isNavigation) refused.push(targetUrl.host);
    await route.abort('blockedbyclient');
    return;
  }
  let response: APIResponse;
  try {
    response = await route.fetch({ maxRedirects: 0 });
  } catch {
    // A failed upstream fetch (DNS, TLS, reset) fails only this request, as the browser would.
    await route.abort('failed');
    return;
  }
  const location = response.headers()['location'];
  if (response.status() >= 300 && response.status() < 400 && location) {
    const redirectUrl = new URL(location, targetUrl);
    if (!permitted(redirectUrl)) {
      if (isNavigation) refused.push(redirectUrl.host);
      await route.abort('blockedbyclient');
      return;
    }
  }
  await route.fulfill({ response });
}

/**
 * Records a short webm of a public page. Every capture gets a fresh browser context:
 * no stored profile, cookies or sessions. Requests follow `guardCaptureRoute`; WebSockets are
 * closed before they connect, since `context.route` never sees them.
 */
export class PlaywrightRecorder {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    try {
      this.browser = await chromium.launch({ headless: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ProviderError(`could not launch Chromium (run "pnpm --filter @ace/toolbox exec playwright install chromium"): ${detail}`, 'playwright');
    }
    return this.browser;
  }

  async record(request: LiveCaptureRequest): Promise<CaptureResult> {
    const browser = await this.getBrowser();
    const size = viewports[request.viewport];
    const recordingS = Math.min(MAX_RECORDING_S, Math.max(MIN_RECORDING_S, request.durationS));
    const videoDir = await mkdtemp(join(tmpdir(), 'ace-capture-'));
    const context = await browser.newContext({
      viewport: size,
      deviceScaleFactor: 1,
      recordVideo: { dir: videoDir, size },
      acceptDownloads: false,
      serviceWorkers: 'block',
    });
    let contextClosed = false;
    try {
      const refusedNavigations: string[] = [];
      await context.route('**/*', (route) => guardCaptureRoute(route, request.allowedHosts, refusedNavigations));
      await context.routeWebSocket(/.*/, (webSocket) => webSocket.close({ code: WEBSOCKET_POLICY_CLOSE, reason: 'blocked by capture policy' }));
      const page = await context.newPage();
      const startedAt = Date.now();
      try {
        await page.goto(request.url.href, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
      } catch (error) {
        if (refusedNavigations.length > 0) {
          throw new BlockedError(`capture of ${request.url.host} tried to leave the allowlist for ${refusedNavigations.join(', ')}`, 'CAPTURE_NOT_ALLOWED');
        }
        throw error;
      }
      const landedUrl = new URL(page.url());
      if (!isHostAllowed(landedUrl, request.allowedHosts)) {
        throw new BlockedError(`capture of ${request.url.host} ended on ${landedUrl.host}, which is not allowlisted`, 'CAPTURE_NOT_ALLOWED');
      }
      const deadline = startedAt + recordingS * 1000;
      // A slow scroll makes the capture read as a live page rather than a still.
      while (Date.now() < deadline) {
        await page.mouse.wheel(0, SCROLL_STEP_PX);
        await page.waitForTimeout(Math.min(1000, Math.max(0, deadline - Date.now())));
      }
      const video = page.video();
      // The webm is only finalised once its context closes.
      await context.close();
      contextClosed = true;
      if (!video) throw new ProviderError('Playwright produced no video for the capture', 'playwright');
      const bytes = await readFile(await video.path());
      return {
        bytes,
        mimeType: 'video/webm',
        kind: 'capture',
        provenance: `live capture of ${request.url.href} at ${new Date(startedAt).toISOString()}`,
        license: 'original capture',
        usage: [{ provider: 'playwright', unit: 'capture_seconds', quantity: recordingS, usdEstimate: 0 }],
      };
    } finally {
      if (!contextClosed) await context.close();
      await rm(videoDir, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
