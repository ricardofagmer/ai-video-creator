import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { BlockedError, type CaptureResult } from '@studio/shared/ace';
import type { CaptureViewport } from '../../config/env';
import { ProviderError } from '../../errors';
import { isHostAllowed } from './capture-url';

const MAX_RECORDING_S = 20;
const MIN_RECORDING_S = 2;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SCROLL_STEP_PX = 240;
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
 * Records a short webm of a public page. Every capture gets a fresh browser context:
 * no stored profile, cookies or sessions. Every navigation (main frame, iframes and each
 * redirect hop) must stay on the https allowlist and off local-network addresses.
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
      await context.route('**/*', async (route) => {
        const target = route.request();
        if (!target.isNavigationRequest()) {
          await route.continue();
          return;
        }
        const targetUrl = new URL(target.url());
        if (!isHostAllowed(targetUrl, request.allowedHosts)) {
          refusedNavigations.push(targetUrl.host);
          await route.abort('blockedbyclient');
          return;
        }
        // A route handler only sees the first URL of a redirect chain, so redirects are
        // fetched without following and their target is checked before the browser sees it.
        const response = await route.fetch({ maxRedirects: 0 });
        const location = response.headers()['location'];
        if (response.status() >= 300 && response.status() < 400 && location) {
          const redirectUrl = new URL(location, targetUrl);
          if (!isHostAllowed(redirectUrl, request.allowedHosts)) {
            refusedNavigations.push(redirectUrl.host);
            await route.abort('blockedbyclient');
            return;
          }
        }
        await route.fulfill({ response });
      });
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
