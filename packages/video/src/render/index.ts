import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { LocalRenderInputSchema, compositionIds, type RenderInput, type RenderTemplateId } from '@studio/shared/ace';

// dist/render/index.js and src/render/index.ts both sit two levels below the package root.
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
// The Remotion source ships uncompiled: bundle() needs the TSX entry at render time.
const ENTRY_POINT = join(PACKAGE_ROOT, 'src', 'index.ts');
const THUMBNAIL_AT_S = 1.5;

let serveUrlPromise: Promise<string> | undefined;

/** Bundles the compositions once per process; a failed bundle is retried on the next call. */
function getServeUrl(): Promise<string> {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({ entryPoint: ENTRY_POINT }).catch((error: unknown) => {
      serveUrlPromise = undefined;
      throw error;
    });
  }
  return serveUrlPromise;
}

/** Every render template id maps to a composition registered in `Root.tsx`, the 16:9 tour included. */
export function compositionIdFor(template: RenderTemplateId): (typeof compositionIds)[RenderTemplateId] {
  return compositionIds[template];
}

/**
 * Renders the MP4 (h264/aac, crf 18, yuv420p) and a PNG thumbnail ~1.5 s in.
 * renderSeconds is wall time for the whole call, including the first-call bundle.
 */
export async function renderVideo(request: {
  input: RenderInput;
  outputPath: string;
  thumbnailPath: string;
}): Promise<{ durationS: number; renderSeconds: number }> {
  // The boundary: loopback media URLs only and no unknown keys, before any bundle or browser work.
  const input = LocalRenderInputSchema.parse(request.input);
  const startedAt = performance.now();
  const serveUrl = await getServeUrl();
  const inputProps: Record<string, unknown> = { ...input };

  const composition = await selectComposition({
    serveUrl,
    id: compositionIdFor(input.template),
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    codec: 'h264',
    audioCodec: 'aac',
    crf: 18,
    pixelFormat: 'yuv420p',
    imageFormat: 'jpeg',
    outputLocation: request.outputPath,
  });

  const thumbnailFrame = Math.min(composition.durationInFrames - 1, Math.round(THUMBNAIL_AT_S * composition.fps));
  await renderStill({
    composition,
    serveUrl,
    inputProps,
    frame: thumbnailFrame,
    imageFormat: 'png',
    output: request.thumbnailPath,
  });

  return {
    durationS: composition.durationInFrames / composition.fps,
    renderSeconds: (performance.now() - startedAt) / 1000,
  };
}

export { renderHook, isHookVideoId, type HookRenderResult, type HookVideoId } from './hook-render';
