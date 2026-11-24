import { writeFile } from 'node:fs/promises';
import { PlaywrightRecorder } from '@ace/toolbox/dist/providers/media/playwright-capture';
import { startStaticServer } from '@ace/toolbox/dist/render/static-server';
import { renderVideo } from '@ace/video';
import { type z } from 'zod';
import {
  type LiveCaptureRequestSchema,
  type PageTextRequestSchema,
  type RenderRequest,
} from '../tool-runner.protocol';
import { withGuardedPage } from './guarded-page';

type LiveCaptureRequest = z.infer<typeof LiveCaptureRequestSchema>;
type PageTextRequest = z.infer<typeof PageTextRequestSchema>;

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

/** Visible text of the brief's page, read under the host guard of `withGuardedPage`. */
export async function pageText(request: PageTextRequest): Promise<{ title: string; text: string; truncated: boolean }> {
  return withGuardedPage(request.url, async (page) => {
    const title = (await page.title()).slice(0, 500);
    const text = (await page.innerText('body')).replace(/\s+/g, ' ').trim();
    return { title, text: text.slice(0, request.maxChars), truncated: text.length > request.maxChars };
  });
}
