import { writeFile } from 'node:fs/promises';
import { type Page } from 'playwright';
import { type z } from 'zod';
import { type PageScreenshotRequestSchema } from '../tool-runner.protocol';
import { NAVIGATION_TIMEOUT_MS, withGuardedPage, type GuardedViewport } from './guarded-page';

type PageScreenshotRequest = z.infer<typeof PageScreenshotRequestSchema>;

/** A common desktop layout; wider pages are seen at this width, never wider than the request allows. */
const DESKTOP_WIDTH_PX = 1440;
const VIEWPORT_HEIGHT_PX = 900;
/** Tried in order until the JPEG fits the byte cap. */
const JPEG_QUALITIES: readonly number[] = [80, 65, 50, 35, 20];

export class ScreenshotTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`page screenshot stayed above ${maxBytes} bytes at the lowest quality`);
    this.name = 'ScreenshotTooLargeError';
  }
}

async function jpegWithin(page: Page, maxBytes: number): Promise<Buffer> {
  for (const quality of JPEG_QUALITIES) {
    // `scale: 'css'` keeps one image pixel per CSS pixel, so the width never exceeds the viewport's.
    const image = await page.screenshot({ type: 'jpeg', quality, fullPage: false, scale: 'css', animations: 'disabled', timeout: NAVIGATION_TIMEOUT_MS });
    if (image.length <= maxBytes) return image;
  }
  throw new ScreenshotTooLargeError(maxBytes);
}

/**
 * One viewport JPEG of the brief's page, under the same host guard as `page-text`. The quality
 * drops until the file fits `maxBytes`; the image goes to the confined output path only.
 */
export async function pageScreenshot(request: PageScreenshotRequest): Promise<{ bytes: number; width: number; height: number }> {
  const viewport: GuardedViewport = { width: Math.min(DESKTOP_WIDTH_PX, request.maxWidthPx), height: VIEWPORT_HEIGHT_PX };
  const image = await withGuardedPage(request.url, (page) => jpegWithin(page, request.maxBytes), viewport);
  // `wx`: the confined path was checked to be free; never follow or overwrite something planted since.
  await writeFile(request.output, image, { flag: 'wx' });
  return { bytes: image.length, width: viewport.width, height: viewport.height };
}
