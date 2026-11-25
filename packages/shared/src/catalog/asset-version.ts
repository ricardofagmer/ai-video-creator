import { z } from 'zod';
import { AbsolutePathSchema, IsoDateTimeSchema, Sha256Schema, type Sha256 } from '../common/ids';
import { AssetIdSchema, AssetStatusSchema, MimeTypeSchema, SensitivitySchema, TagSchema } from './asset-kind';
import {
  AiModelDetailsSchema,
  BrandKitDetailsSchema,
  ImageDetailsSchema,
  MusicDetailsSchema,
  PromptDetailsSchema,
  ReferenceDetailsSchema,
  SfxDetailsSchema,
  SkillDetailsSchema,
  TemplateDetailsSchema,
} from './kind-details';
import { LicenseSchema, ProvenanceSchema } from './provenance';

/**
 * Where the bytes live (ADR 0003 decisions 1 and 2). `store`: an immutable blob at
 * `assets/sha256/<first 2 hex>/<contentHash>` under the data home. `reference`: nothing is
 * copied; the row keeps the absolute path, and `preflight` re-hashes it.
 */
export const AssetStorageSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('store') }).strict(),
  z.object({ mode: z.literal('reference'), absolutePath: AbsolutePathSchema }).strict(),
]);
export type AssetStorage = z.infer<typeof AssetStorageSchema>;

/** `folder`: the content is a canonical folder manifest whose own hash is `contentHash`. */
export const AssetLayoutSchema = z.enum(['file', 'folder']);
export type AssetLayout = z.infer<typeof AssetLayoutSchema>;

/** MIME type recorded for folder assets: the blob is the canonical folder manifest JSON. */
export const folderManifestMimeType = 'application/vnd.studio.folder+json';

/** Longest purpose text (ADR 0012, C-P1): one or two short sentences. */
export const ASSET_PURPOSE_MAX_CHARS = 280;

/** A version's purpose text (ADR 0012, C-P1); empty until the writer or the owner fills it. */
export const AssetPurposeSchema = z.string().max(ASSET_PURPOSE_MAX_CHARS);

/**
 * Who wrote `purpose` (ADR 0012, C-P1): `none` (empty or waiting for a job), `ai` (copied from a
 * done `asset-purpose` job) or `owner` (an owner edit, which no job ever overwrites).
 */
export const AssetPurposeSourceSchema = z.enum(['none', 'ai', 'owner']);
export type AssetPurposeSource = z.infer<typeof AssetPurposeSourceSchema>;

/** Every required field of PRD 5.2 except the kind-specific ones; `summary` feeds the agent tools. */
export const assetVersionBaseShape = {
  id: AssetIdSchema,
  name: z.string().min(1).max(200),
  /** Short text matched and shown by CatalogSearchTool (topology 3.2); may be empty. */
  summary: z.string().max(200),
  version: z.number().int().min(1),
  status: AssetStatusSchema,
  tags: z.array(TagSchema).max(32),
  owner: z.string().min(1).max(100),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  contentHash: Sha256Schema,
  sizeBytes: z.number().int().nonnegative(),
  mimeType: MimeTypeSchema,
  layout: AssetLayoutSchema,
  storage: AssetStorageSchema,
  /** Null only while a third-party draft is incomplete; such a version cannot become `active`. */
  provenance: ProvenanceSchema.nullable(),
  license: LicenseSchema.nullable(),
  sensitivity: SensitivitySchema,
  usageCount: z.number().int().nonnegative(),
  /**
   * `computeQualityScore` (SPEC 0003 section 5.1), bounded 1..5; null means "no reviewed runs",
   * never zero. Displayed, sorted and filtered only; no code compares it with a threshold.
   */
  qualityScore: z.number().finite().min(1).max(5).nullable(),
  /** Rev 3 (SPEC 0003): the number of reviewed runs the score is based on; 0 exactly when the score is null. */
  qualitySampleSize: z.number().int().nonnegative(),
  /**
   * SPEC 0006 section 5.4: how many of those reviewed runs carried a platform signal `p_i`;
   * at most `qualitySampleSize`. Shown beside the score ("4 execuções, 1 com métricas").
   */
  qualityPlatformSampleSize: z.number().int().nonnegative(),
  /** Rev 3 (SPEC 0003): when the score was last computed; null before the first computation. */
  qualityScoredAt: IsoDateTimeSchema.nullable(),
  /**
   * Notes authored with the version (R1 meaning, kept; SPEC 0003 L3). R2 learnings written back
   * from runs are rows beside the version (`LearningNoteSchema`), not this string.
   */
  notes: z.string().max(10000),
  /**
   * ADR 0012 (C-P1): what the asset is for, in plain pt-BR. Not part of the upload metadata: only
   * the copy of a done `asset-purpose` job or an owner edit sets it, and only these two columns
   * change on a saved version.
   */
  purpose: AssetPurposeSchema.default(''),
  purposeSource: AssetPurposeSourceSchema.default('none'),
  /**
   * Filled by core from a local model (D10, ADR 0004). Present only in core's search-scan
   * projection: no api view and no agent-facing read carries it (SPEC 0003 L8, R2-AC-10).
   */
  embedding: z.array(z.number().finite()).min(1).max(4096).optional(),
};

export const TemplateAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('template'), details: TemplateDetailsSchema })
  .strict();
export const AiModelAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('ai-model'), details: AiModelDetailsSchema })
  .strict();
export const ReferenceAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('reference'), details: ReferenceDetailsSchema })
  .strict();
export const PromptAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('prompt'), details: PromptDetailsSchema })
  .strict();
export const SkillAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('skill'), details: SkillDetailsSchema })
  .strict();
export const ImageAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('image'), details: ImageDetailsSchema })
  .strict();
export const MusicAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('music'), details: MusicDetailsSchema })
  .strict();
export const SfxAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('sfx'), details: SfxDetailsSchema })
  .strict();
export const BrandKitAssetVersionSchema = z
  .object({ ...assetVersionBaseShape, kind: z.literal('brand-kit'), details: BrandKitDetailsSchema })
  .strict();

/** The variants without the cross-field rules, for callers that need `.options` or per-kind schemas. */
export const AssetVersionVariantsSchema = z.discriminatedUnion('kind', [
  TemplateAssetVersionSchema,
  AiModelAssetVersionSchema,
  ReferenceAssetVersionSchema,
  PromptAssetVersionSchema,
  SkillAssetVersionSchema,
  ImageAssetVersionSchema,
  MusicAssetVersionSchema,
  SfxAssetVersionSchema,
  BrandKitAssetVersionSchema,
]);

/**
 * One immutable asset version (PRD 5.2, 5.4). Cross-field rules enforced here as well as in the
 * catalog handlers, so no writer can persist a row that breaks them:
 * - a biometric version is registered by reference only (criterion 22);
 * - a third-party version cannot be `active` without license and provenance (criterion 7);
 * - a skill is a folder asset;
 * - `qualityScore` is null exactly when `qualitySampleSize` is 0 (SPEC 0003 section 4.2);
 * - `qualityPlatformSampleSize` is at most `qualitySampleSize` (SPEC 0006 section 4.1).
 */
export const AssetVersionSchema = AssetVersionVariantsSchema.superRefine((version, context) => {
  if ((version.qualityScore === null) !== (version.qualitySampleSize === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qualityScore'],
      message: 'qualityScore is null exactly when qualitySampleSize is 0',
    });
  }
  if (version.qualityPlatformSampleSize > version.qualitySampleSize) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qualityPlatformSampleSize'],
      message: 'qualityPlatformSampleSize is at most qualitySampleSize',
    });
  }
  if (version.sensitivity === 'biometric' && version.storage.mode !== 'reference') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['storage'],
      message: 'a biometric asset is registered by reference only; no bytes enter the store',
    });
  }
  if (
    version.status === 'active' &&
    version.sensitivity === 'third-party' &&
    (version.license === null || version.provenance === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'a third-party asset needs license and provenance before it can be active',
    });
  }
  if (version.kind === 'skill' && version.layout !== 'folder') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['layout'], message: 'a skill is a folder asset' });
  }
});
export type AssetVersion = z.infer<typeof AssetVersionSchema>;

/** Relative location of a stored blob under the data home (ADR 0003 decision 1). */
export function contentStorePath(contentHash: Sha256): string {
  return `assets/sha256/${contentHash.slice(0, 2)}/${contentHash}`;
}
