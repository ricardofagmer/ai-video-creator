import { z } from 'zod';
import { KebabIdSchema } from '../common/ids';

/** PRD 5.1. The tag vocabulary and this enum are the semantic layer of CatalogSearchTool (topology 3.3). */
export const AssetKindSchema = z.enum([
  'template',
  'ai-model',
  'reference',
  'prompt',
  'skill',
  'image',
  'music',
  'sfx',
  'brand-kit',
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;
export const assetKinds = AssetKindSchema.options;

/** PRD 5.2. A version is `draft` when saved; only an explicit owner action makes it `active`. */
export const AssetStatusSchema = z.enum(['draft', 'active', 'deprecated']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

/** PRD 5.2. `biometric` rows are path + hash only and never agent-readable (ADR 0003 decision 2). */
export const SensitivitySchema = z.enum(['normal', 'biometric', 'third-party']);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const AssetIdSchema = KebabIdSchema;
export type AssetId = z.infer<typeof AssetIdSchema>;

/**
 * `assetId@version`. The pattern is frozen verbatim from SPEC 0002 C1 and topology 3.2
 * (AssetDescribeTool input) so tool schemas and catalog rows agree character for character.
 */
export const assetRefPattern = /^[a-z0-9-]+@\d+$/;
export const AssetRefSchema = z.string().regex(assetRefPattern, 'expected assetId@version');
export type AssetRef = z.infer<typeof AssetRefSchema>;

export interface ParsedAssetRef {
  assetId: AssetId;
  version: number;
}

export class InvalidAssetRefError extends Error {
  constructor(readonly ref: string) {
    super(`Invalid asset reference "${ref}": expected assetId@version`);
    this.name = 'InvalidAssetRefError';
  }
}

export function parseAssetRef(ref: string): ParsedAssetRef {
  if (!assetRefPattern.test(ref)) throw new InvalidAssetRefError(ref);
  const separator = ref.lastIndexOf('@');
  return { assetId: ref.slice(0, separator), version: Number.parseInt(ref.slice(separator + 1), 10) };
}

export function formatAssetRef(parsed: ParsedAssetRef): AssetRef {
  return `${parsed.assetId}@${parsed.version}`;
}

/** Lowercase tag, AND-matched by CatalogSearchTool (topology 3.2). */
export const TagSchema = z
  .string()
  .regex(/^[a-z0-9]+([-.][a-z0-9]+)*$/, 'tags are lowercase words joined by - or .')
  .max(40);
export type Tag = z.infer<typeof TagSchema>;

/** `type/subtype` MIME string; the per-kind allowlist is enforced at upload by R1-05. */
export const MimeTypeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/, 'expected a MIME type such as audio/mpeg')
  .max(127);
