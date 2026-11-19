import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { ExternalToolError, InputError } from '../errors';
import type { CaptionCue } from './srt';

export type CaptionStyle = 'bold' | 'highlight' | 'box';

export interface CaptionImage {
  path: string;
  width: number;
  height: number;
}

export interface CaptionRenderRequest {
  cues: readonly CaptionCue[];
  frameWidth: number;
  frameHeight: number;
  fontSizePx: number;
  style: CaptionStyle;
  fontFile: string | null;
  dir: string;
}

interface StyleLook {
  fill: string;
  stroke: string | null;
  box: string | null;
}

// Same looks as captions.py STYLES; the box alpha 170/255 is 0.667.
const looks: Record<CaptionStyle, StyleLook> = {
  bold: { fill: '#ffffff', stroke: '#000000', box: null },
  highlight: { fill: '#ffde3c', stroke: '#000000', box: null },
  box: { fill: '#ffffff', stroke: null, box: 'rgba(0,0,0,0.667)' },
};
const DEFAULT_FONT_STACK = "Arial, 'Helvetica Neue', 'DejaVu Sans', sans-serif";
const FONT_MIME: Record<string, string> = { '.ttf': 'font/ttf', '.otf': 'font/otf' };
const MAX_FONT_BYTES = 20 * 1024 * 1024;
const STROKE_DIRECTIONS = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Pillow's stroke_width draws an outline around each glyph; a ring of hard shadows matches it. */
function strokeShadow(color: string, widthPx: number): string {
  return Array.from({ length: STROKE_DIRECTIONS }, (_, index) => {
    const angle = (2 * Math.PI * index) / STROKE_DIRECTIONS;
    return `${(Math.cos(angle) * widthPx).toFixed(2)}px ${(Math.sin(angle) * widthPx).toFixed(2)}px 0 ${color}`;
  }).join(',');
}

async function fontFaceCss(fontFile: string | null): Promise<{ css: string; family: string }> {
  if (!fontFile) return { css: '', family: DEFAULT_FONT_STACK };
  const mime = FONT_MIME[extname(fontFile).toLowerCase()];
  if (!mime) throw new InputError(`font file must be .ttf or .otf: ${fontFile}`);
  const { size } = await stat(fontFile);
  if (size > MAX_FONT_BYTES) throw new InputError(`font file is over 20 MB: ${fontFile}`);
  // base64 holds only [A-Za-z0-9+/=], so the data URL cannot break out of the CSS string.
  const data = (await readFile(fontFile)).toString('base64');
  return { css: `@font-face{font-family:'CaptionFont';src:url(data:${mime};base64,${data});}`, family: "'CaptionFont'" };
}

/** Layout of captions.py `render_cue`: 86% of the frame width, padding size/3, line height 1.25. */
function cueHtml(text: string, request: CaptionRenderRequest, font: { css: string; family: string }): string {
  const look = looks[request.style];
  const size = request.fontSizePx;
  const stroke = look.stroke ? Math.max(2, Math.floor(size / 12)) : 0;
  const padding = Math.floor(size / 3) + stroke;
  const maxWidth = Math.floor(request.frameWidth * 0.86);
  const outline = look.stroke ? `text-shadow:${strokeShadow(look.stroke, stroke)};` : '';
  const box = look.box ? `background:${look.box};border-radius:${Math.floor(size / 3)}px;` : '';
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    font.css,
    'html,body{margin:0;padding:0;background:transparent;}',
    `#cue{display:inline-block;box-sizing:border-box;max-width:${maxWidth}px;padding:${padding}px;`,
    `font-family:${font.family};font-weight:700;font-size:${size}px;line-height:${Math.floor(size * 1.25)}px;`,
    `text-align:center;color:${look.fill};overflow-wrap:anywhere;${outline}${box}}`,
    `</style></head><body><div id="cue">${escapeHtml(text)}</div></body></html>`,
  ].join('');
}

function pngSize(image: Buffer): { width: number; height: number } {
  if (image.length < 24 || !image.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new ExternalToolError('caption renderer returned an invalid PNG', 'playwright');
  }
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ExternalToolError(`could not launch Chromium for caption images (run "pnpm --filter @ace/toolbox exec playwright install chromium"): ${detail}`, 'playwright');
  }
}

/**
 * Draws each cue as a transparent PNG (the port of captions.py `render_cue`, which used Pillow).
 * Images keep caption burn independent of ffmpeg builds without the subtitles or drawtext filters.
 * The page runs with JavaScript off and every network request refused; cue text is HTML-escaped.
 */
export async function renderCaptionImages(request: CaptionRenderRequest): Promise<CaptionImage[]> {
  const font = await fontFaceCss(request.fontFile);
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: request.frameWidth, height: request.frameHeight },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    const images: CaptionImage[] = [];
    for (const [index, cue] of request.cues.entries()) {
      await page.setContent(cueHtml(cue.text, request, font), { waitUntil: 'load' });
      const path = join(request.dir, `cue_${String(index + 1).padStart(4, '0')}.png`);
      const image = await page.locator('#cue').screenshot({ path, omitBackground: true });
      const { width, height } = pngSize(image);
      if (height > request.frameHeight) throw new InputError(`caption ${index + 1} is taller than the frame; shorten its text`);
      images.push({ path, width, height });
    }
    return images;
  } finally {
    await browser.close();
  }
}
