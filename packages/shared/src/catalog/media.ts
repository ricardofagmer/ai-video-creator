import { z } from 'zod';

/** Aspect ratios the R1 recipes and templates use; the brief's `format` is one of these. */
export const AspectRatioSchema = z.enum(['16:9', '9:16', '1:1']);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const CanvasSchema = z
  .object({
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(7680),
  })
  .strict();
export type Canvas = z.infer<typeof CanvasSchema>;

export const FpsSchema = z.number().int().min(1).max(120);

/** Inclusive duration range in seconds; `min <= max` is enforced. */
export const DurationRangeSchema = z
  .object({
    minSec: z.number().positive().max(3600),
    maxSec: z.number().positive().max(3600),
  })
  .strict()
  .refine((range) => range.minSec <= range.maxSec, { message: 'minSec must not exceed maxSec' });
export type DurationRange = z.infer<typeof DurationRangeSchema>;

/** CSS hex colour, `#rrggbb` or `#rrggbbaa`. */
export const HexColorSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected #rrggbb or #rrggbbaa');
