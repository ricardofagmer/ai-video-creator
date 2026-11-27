import { AspectRatioSchema, CanvasSchema, FpsSchema, type AspectRatio, type Canvas, type TemplateDetails } from '@studio/shared/catalog';
import { type Recipe } from '@studio/shared/recipes';

/** The suggested video formats; each keeps to the three aspects a recipe accepts (16:9, 9:16, 1:1). */
export const formatPresetIds = [
  'youtube',
  'youtube-shorts',
  'instagram-reels',
  'instagram-square',
  'facebook-reels',
  'facebook-square',
  'tiktok',
  'traditional',
  'custom',
] as const;
export type FormatPresetId = (typeof formatPresetIds)[number];

interface PresetSize {
  width: number;
  height: number;
  fps: number;
}

const presetSizes: Readonly<Record<Exclude<FormatPresetId, 'custom'>, PresetSize>> = {
  youtube: { width: 1920, height: 1080, fps: 30 },
  'youtube-shorts': { width: 1080, height: 1920, fps: 30 },
  'instagram-reels': { width: 1080, height: 1920, fps: 30 },
  'instagram-square': { width: 1080, height: 1080, fps: 30 },
  'facebook-reels': { width: 1080, height: 1920, fps: 30 },
  'facebook-square': { width: 1080, height: 1080, fps: 30 },
  tiktok: { width: 1080, height: 1920, fps: 30 },
  traditional: { width: 1920, height: 1080, fps: 30 },
};

/** The owner's format answer as typed: the fields stay text so a half-typed number is kept. */
export interface WizardFormat {
  preset: FormatPresetId;
  width: string;
  height: string;
  fps: string;
}

/** The format a recipe takes, once the typed answer is a canvas of an accepted aspect. */
export interface ResolvedFormat {
  canvas: Canvas;
  aspect: AspectRatio;
  fps: number;
}

export type FormatProblem = 'size' | 'fps' | 'aspect';

export type FormatResult = { kind: 'valid'; format: ResolvedFormat } | { kind: 'invalid'; problem: FormatProblem };

/** The recipe's own rule: the canvas ratio may differ from the aspect by at most 0.01. */
const ASPECT_TOLERANCE = 0.01;

export function presetFormat(preset: Exclude<FormatPresetId, 'custom'>): WizardFormat {
  const size = presetSizes[preset];
  return { preset, width: String(size.width), height: String(size.height), fps: String(size.fps) };
}

/** The base recipe's format as an answer: a preset when its size matches one, else "Custom". */
export function formatOfRecipe(recipe: Pick<Recipe, 'format'>): WizardFormat {
  const { canvas, fps } = recipe.format;
  return { preset: presetOfSize(canvas.width, canvas.height, fps), width: String(canvas.width), height: String(canvas.height), fps: String(fps) };
}

/** The first suggested format with this exact size and fps, else "Custom". */
export function presetOfSize(width: number, height: number, fps: number): FormatPresetId {
  return formatPresetIds.find((id) => presetHasSize(id, width, height, fps)) ?? 'custom';
}

/** Several suggestions share a size (TikTok and Shorts are both 1080x1920), so a picked one is checked by id. */
export function presetHasSize(preset: FormatPresetId, width: number, height: number, fps: number): boolean {
  if (preset === 'custom') return false;
  const size = presetSizes[preset];
  return size.width === width && size.height === height && size.fps === fps;
}

export function aspectOfCanvas(canvas: Canvas): AspectRatio | null {
  const ratio = canvas.width / canvas.height;
  return (
    AspectRatioSchema.options.find((aspect) => {
      const [width = 0, height = 1] = aspect.split(':').map((part) => Number.parseInt(part, 10));
      return Math.abs(ratio - width / height) <= ASPECT_TOLERANCE;
    }) ?? null
  );
}

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,5}$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

/** The typed answer checked against the recipe's canvas, fps and aspect rules. */
export function resolveFormat(format: WizardFormat): FormatResult {
  const canvas = CanvasSchema.safeParse({ width: wholeNumber(format.width), height: wholeNumber(format.height) });
  if (!canvas.success) return { kind: 'invalid', problem: 'size' };
  const fps = FpsSchema.safeParse(wholeNumber(format.fps));
  if (!fps.success) return { kind: 'invalid', problem: 'fps' };
  const aspect = aspectOfCanvas(canvas.data);
  if (aspect === null) return { kind: 'invalid', problem: 'aspect' };
  return { kind: 'valid', format: { canvas: canvas.data, aspect, fps: fps.data } };
}

export function sameFormat(left: ResolvedFormat, right: Pick<Recipe['format'], 'canvas' | 'aspect' | 'fps'>): boolean {
  return left.aspect === right.aspect && left.fps === right.fps && left.canvas.width === right.canvas.width && left.canvas.height === right.canvas.height;
}

/** A template renders only at its own canvas and fps, so the composition rules refuse any other. */
export function templateFitsFormat(details: Pick<TemplateDetails, 'canvas' | 'aspect' | 'fps'>, format: Pick<Recipe['format'], 'canvas' | 'aspect' | 'fps'>): boolean {
  return sameFormat({ canvas: details.canvas, aspect: details.aspect, fps: details.fps }, format);
}
