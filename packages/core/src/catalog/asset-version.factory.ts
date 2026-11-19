import { z } from 'zod';
import {
  AiModelDetailsSchema,
  AssetIdSchema,
  AssetKindSchema,
  AssetVersionSchema,
  BrandKitDetailsSchema,
  ImageDetailsSchema,
  MusicDetailsSchema,
  PromptDetailsSchema,
  ReferenceDetailsSchema,
  SfxDetailsSchema,
  SkillDetailsSchema,
  TemplateDetailsSchema,
  assetVersionBaseShape,
  type AssetId,
  type AssetKind,
  type AssetVersion,
} from '@studio/shared/catalog';
import { InvalidAssetInputError, type InputIssue } from './catalog.errors';
import { type PreparedContent } from './asset-content';

/** C1 kind-specific schema per kind, so `details` is checked before any byte is stored. */
const DETAILS_SCHEMA_BY_KIND: Readonly<Record<AssetKind, z.ZodTypeAny>> = {
  template: TemplateDetailsSchema,
  'ai-model': AiModelDetailsSchema,
  reference: ReferenceDetailsSchema,
  prompt: PromptDetailsSchema,
  skill: SkillDetailsSchema,
  image: ImageDetailsSchema,
  music: MusicDetailsSchema,
  sfx: SfxDetailsSchema,
  'brand-kit': BrandKitDetailsSchema,
};

/**
 * Owner-supplied metadata of a new version (PRD 5.2). System fields (`version`, `status`,
 * timestamps, `usageCount`, `qualityScore`, `qualitySampleSize`, `qualityScoredAt`, storage facts)
 * are never accepted from callers. `provenance` accepts every C1 source, `comparison` included.
 * `details` is checked against the kind's C1 schema by `parseMetadata`, before bytes are stored.
 */
export const AssetVersionMetadataSchema = z
  .object({
    name: assetVersionBaseShape.name,
    summary: assetVersionBaseShape.summary.default(''),
    tags: assetVersionBaseShape.tags.default([]),
    owner: assetVersionBaseShape.owner,
    provenance: assetVersionBaseShape.provenance.default(null),
    license: assetVersionBaseShape.license.default(null),
    sensitivity: assetVersionBaseShape.sensitivity,
    notes: assetVersionBaseShape.notes.default(''),
    details: z.unknown(),
  })
  .strict();
export type AssetVersionMetadataInput = z.input<typeof AssetVersionMetadataSchema>;
export type AssetVersionMetadata = z.output<typeof AssetVersionMetadataSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidAssetInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}

export function parseAssetId(input: unknown): AssetId {
  return parseInput(AssetIdSchema, input, 'assetId');
}

export function parseAssetKind(input: unknown): AssetKind {
  return parseInput(AssetKindSchema, input, 'kind');
}

export function parseMetadata(input: unknown, kind: AssetKind): AssetVersionMetadata {
  const metadata = parseInput(AssetVersionMetadataSchema, input, 'metadata');
  parseInput(DETAILS_SCHEMA_BY_KIND[kind], metadata.details, 'metadata.details');
  return metadata;
}

export interface NewVersionFacts {
  assetId: AssetId;
  kind: AssetKind;
  version: number;
  metadata: AssetVersionMetadata;
  content: PreparedContent;
  now: Date;
}

/**
 * Assembles a `draft` version and validates it whole with the C1 schema, so the kind-specific
 * details and the cross-field rules (biometric by reference, skill is a folder) hold before any
 * row is written.
 */
export function buildDraftVersion(facts: NewVersionFacts): AssetVersion {
  const timestamp = facts.now.toISOString();
  const candidate: Record<string, unknown> = {
    id: facts.assetId,
    kind: facts.kind,
    name: facts.metadata.name,
    summary: facts.metadata.summary,
    version: facts.version,
    status: 'draft',
    tags: facts.metadata.tags,
    owner: facts.metadata.owner,
    createdAt: timestamp,
    updatedAt: timestamp,
    contentHash: facts.content.contentHash,
    sizeBytes: facts.content.sizeBytes,
    mimeType: facts.content.mimeType,
    layout: facts.content.layout,
    storage: facts.content.storage,
    provenance: facts.metadata.provenance,
    license: facts.metadata.license,
    sensitivity: facts.metadata.sensitivity,
    usageCount: 0,
    // No reviewed run yet: no score, never zero (SPEC 0003 section 5.1, R2-AC-01).
    qualityScore: null,
    qualitySampleSize: 0,
    qualityPlatformSampleSize: 0,
    qualityScoredAt: null,
    notes: facts.metadata.notes,
    details: facts.metadata.details,
  };
  return parseInput(AssetVersionSchema, candidate, '');
}
