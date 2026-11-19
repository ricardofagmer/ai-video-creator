import { z } from 'zod';
import { AspectRatioSchema } from '../catalog/media';

/** Languages of the R1 recipes: "Product tour 16:9" is pt-BR, "Tool Demo 9:16" is English (D12). */
export const LanguageSchema = z.enum(['pt-BR', 'en-US']);
export type Language = z.infer<typeof LanguageSchema>;

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
    message: 'sourceUrl must be http or https',
  });

/**
 * The owner's brief for one run (PRD 6, topology section 5 `Brief`, fixture of topology section 11).
 * Run-specific references are kept beside it in run.json, not inside it.
 */
export const BriefSchema = z
  .object({
    topic: z.string().min(3).max(300),
    sourceUrl: httpUrlSchema.optional(),
    keyMessages: z.array(z.string().min(1).max(300)).max(10),
    format: AspectRatioSchema,
    language: LanguageSchema,
    targetDurationSec: z.number().int().positive().max(600),
  })
  .strict();
export type Brief = z.infer<typeof BriefSchema>;

/** Brief fields a recipe can require beyond the always-required ones (PRD 6 `inputs`). */
export const BriefFieldSchema = z.enum(['sourceUrl', 'keyMessages']);
export type BriefField = z.infer<typeof BriefFieldSchema>;
