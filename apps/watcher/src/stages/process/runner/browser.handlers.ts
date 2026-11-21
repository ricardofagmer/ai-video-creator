import { writeFile } from 'node:fs/promises';
import { isHostAllowed } from '@ace/toolbox/dist/providers/media/capture-url';
import { PlaywrightRecorder } from '@ace/toolbox/dist/providers/media/playwright-capture';
import { startStaticServer } from '@ace/toolbox/dist/render/static-server';
import { renderVideo } from '@ace/video';
import { chromium, type Route } from 'playwright';
import { type z } from 'zod';
import {
  type LiveCaptureRequestSchema,
  type PageTextRequestSchema,
  type RenderRequest,
} from '../tool-runner.protocol';

type LiveCaptureRequest = z.infer<typeof LiveCaptureRequestSchema>;
type PageTextRequest = z.infer<typeof PageTextRequestSchema>;

const NAVIGATION_TIMEOUT_MS = 30_000;

export class NavigationRefusedError extends Error {
  constructor(readonly host: string) {
    super(`navigation left the allowlist for ${host}`);
    this.name = 'NavigationRefusedError';
  }
}

function segmentUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl}/${relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
}

/**
 * Remotion render of the bound template (`@ace/video`). Run media is served read-only from the run
 * folder on 127.0.0.1 under a random path token (toolbox `startStaticServer`), so the renderer
 * fetches nothing off the machine.
 */
export async function render(request: RenderRequest): Promise<{ durationS: number; renderSeconds: number }> {
  const server = await startStaticServer(request.serveRoot);
  try {
    return await renderVideo({
      input: {
        template: request.template,
        title: request.title,
        durationS: request.durationS,
        audioUrl: segmentUrl(server.baseUrl, request.audioPath),
        scenes: request.scenes.map((scene) => ({
          id: scene.id,
          kind: scene.kind,
          startS: scene.startS,
          endS: scene.endS,
          onScreenText: scene.onScreenText,
          asset: scene.asset === null ? null : { url: segmentUrl(server.baseUrl, scene.asset.path), kind: scene.asset.kind },
        })),
        captions: request.captions,
        disclosure: request.disclosure,
      },
      outputPath: request.output,
      thumbnailPath: request.thumbnail,
    });
  } finally {
    await server.close();
  }
}

/** Live capture of the brief's page through the toolbox recorder, allowlisted to its own host. */
export async function liveCapture(request: LiveCaptureRequest): Promise<{ durationS: number }> {
  const url = new URL(request.url);
  const recorder = new PlaywrightRecorder();
  try {
    const capture = await recorder.record({ url, durationS: request.durationS, allowedHosts: [url.hostname.toLowerCase()], viewport: request.viewport });
    await writeFile(request.output, capture.bytes);
    return { durationS: request.durationS };
  } finally {
    await recorder.close();
  }
}

/**
 * Visible text of the brief's page. Every request, navigation or not, must stay on the page's own
 * https host (toolbox `isHostAllowed` also refuses local-network addresses); redirects are checked
 * before the browser follows them; WebSockets are closed unopened. A fresh context: no profile,
 * cookies or service workers.
 */
export async function pageText(request: PageTextRequest): Promise<{ title: string; text: string; truncated: boolean }> {
  const url = new URL(request.url);
  const allowedHosts = [url.hostname.toLowerCase()];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', javaScriptEnabled: true });
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
    const title = (await page.title()).slice(0, 500);
    const text = (await page.innerText('body')).replace(/\s+/g, ' ').trim();
    await context.close();
    return { title, text: text.slice(0, request.maxChars), truncated: text.length > request.maxChars };
  } finally {
    await browser.close();
  }
}
