import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { HookRenderInputSchema, hookCompositionIds, hookSpec, type HookRenderInput } from '@studio/shared/ace';

const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const ENTRY_POINT = join(PACKAGE_ROOT, 'src', 'index.ts');

let serveUrlPromise: Promise<string> | undefined;

function getServeUrl(): Promise<string> {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({ entryPoint: ENTRY_POINT }).catch((error: unknown) => {
      serveUrlPromise = undefined;
      throw error;
    });
  }
  return serveUrlPromise;
}

export type HookVideoId = keyof typeof hookCompositionIds;

export function isHookVideoId(value: string): value is HookVideoId {
  return Object.hasOwn(hookCompositionIds, value);
}

export interface HookRenderResult {
  videoPath: string;
  coverPath: string;
  carouselPaths: string[];
  avatarPath: string | null;
  renderSeconds: number;
}

/**
 * Renders one hook: video.mp4 (h264/aac), cover.png (9:16), and when the hook has them
 * carousel-<n>.png (4:5) and avatar.png (1:1).
 * Each still selects its own composition because renderStill renders composition.props.
 */
export async function renderHook(request: { videoId: HookVideoId; input: HookRenderInput; outDir: string }): Promise<HookRenderResult> {
  const input = HookRenderInputSchema.parse(request.input);
  const ids = hookCompositionIds[request.videoId];
  const startedAt = performance.now();
  const serveUrl = await getServeUrl();
  const inputProps: Record<string, unknown> = { ...input };

  const video = await selectComposition({ serveUrl, id: ids.video, inputProps });
  const videoPath = join(request.outDir, 'video.mp4');
  await renderMedia({
    composition: video,
    serveUrl,
    inputProps,
    codec: 'h264',
    audioCodec: 'aac',
    audioBitrate: '192k',
    crf: 18,
    pixelFormat: 'yuv420p',
    imageFormat: 'jpeg',
    outputLocation: videoPath,
  });

  const coverPath = join(request.outDir, 'cover.png');
  const cover = await selectComposition({ serveUrl, id: ids.cover, inputProps });
  await renderStill({ composition: cover, serveUrl, inputProps, imageFormat: 'png', output: coverPath });

  const carouselPaths: string[] = [];
  if (ids.carousel) {
    for (let slide = 1; slide <= hookSpec.carousel.slides; slide += 1) {
      const slideProps: Record<string, unknown> = { ...input, slide };
      const composition = await selectComposition({ serveUrl, id: ids.carousel, inputProps: slideProps });
      const output = join(request.outDir, `carousel-${slide}.png`);
      await renderStill({ composition, serveUrl, inputProps: slideProps, imageFormat: 'png', output });
      carouselPaths.push(output);
    }
  }

  let avatarPath: string | null = null;
  if (ids.avatar) {
    avatarPath = join(request.outDir, 'avatar.png');
    const avatar = await selectComposition({ serveUrl, id: ids.avatar, inputProps });
    await renderStill({ composition: avatar, serveUrl, inputProps, imageFormat: 'png', output: avatarPath });
  }

  return { videoPath, coverPath, carouselPaths, avatarPath, renderSeconds: (performance.now() - startedAt) / 1000 };
}
