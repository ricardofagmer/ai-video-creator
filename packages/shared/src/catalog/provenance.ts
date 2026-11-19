import { z } from 'zod';
import { ComparisonIdSchema, CurationIdSchema, IsoDateSchema, IsoDateTimeSchema, RunIdSchema } from '../common/ids';

/**
 * PRD 5.2 provenance: "source URL or 'created here', author, capture date". Seed and run
 * provenance are the two system origins (PRD 5.3 "promote from a run", PRD 5.5 seed).
 * `comparison` (SPEC 0003 section 5.3, B12): the arm-B variant recipe version an A/B comparison
 * saved; it stays `draft`. `curator` (SPEC 0005 section 4.1, C1): a prompt, skill or recipe version
 * the owner saved from a Curator proposal; it is always saved as `draft` (AC 35).
 */
export const ProvenanceSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), url: z.string().url().max(2048) }).strict(),
  z.object({ type: z.literal('created-here') }).strict(),
  z.object({ type: z.literal('seed'), origin: z.enum(['ai-creator-engine', 'spesia-run']) }).strict(),
  z.object({ type: z.literal('run'), runId: RunIdSchema }).strict(),
  z.object({ type: z.literal('comparison'), comparisonId: ComparisonIdSchema }).strict(),
  z.object({ type: z.literal('curator'), curationId: CurationIdSchema }).strict(),
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

export const ProvenanceSchema = z
  .object({
    source: ProvenanceSourceSchema,
    author: z.string().min(1).max(200),
    capturedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const LicenseUseSchema = z.enum([
  'commercial',
  'non-commercial',
  'social-media',
  'modification',
  'attribution-required',
  'internal-only',
]);
export type LicenseUse = z.infer<typeof LicenseUseSchema>;

/** PRD 5.2 license: name, URL, date read, allowed uses. `terms` keeps the license text excerpt. */
export const LicenseSchema = z
  .object({
    name: z.string().min(1).max(200),
    url: z.string().url().max(2048).nullable(),
    readOn: IsoDateSchema,
    allowedUses: z.array(LicenseUseSchema).min(1).max(LicenseUseSchema.options.length),
    terms: z.string().max(4000),
  })
  .strict();
export type License = z.infer<typeof LicenseSchema>;
