import { z } from 'zod';
import {
  AssetIdSchema,
  BrandKitDetailsSchema,
  LicenseSchema,
  MusicDetailsSchema,
  PromptDetailsSchema,
  ProvenanceSchema,
  RelativePathSchema,
  TemplateDetailsSchema,
  assetVersionBaseShape,
} from '@studio/shared/catalog';
import { RecipeIdSchema } from '@studio/shared/recipes';
import { SECRET_NAMES } from '../secrets/secret-names';

/**
 * Executable form of `seeds/catalog.seed.json` (SPEC 0002 R1-07). Every path is relative to the
 * seed source root, so the manifest never holds a machine-specific absolute path, and no field
 * can hold a secret value: credentials are named, never stored (PRD 12).
 */

/**
 * Where a seed entry comes from. `ai-creator-engine` and `spesia-run` are the two seed origins C1
 * `ProvenanceSourceSchema` allows (PRD 5.5); `studio` marks an asset authored in this repository
 * (SPEC 0008 OD7 a), recorded as "created here" provenance, not as a seed origin.
 */
const SeedOriginSchema = z.enum(['ai-creator-engine', 'spesia-run', 'studio']);
export type SeedOrigin = z.infer<typeof SeedOriginSchema>;

/** Environment variable NAME, the same shape C1 accepts for `ModelIdReference`. */
const EnvironmentNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'expected an UPPER_SNAKE_CASE name');

const entryBaseShape = {
  assetId: AssetIdSchema,
  name: assetVersionBaseShape.name,
  summary: assetVersionBaseShape.summary,
  tags: assetVersionBaseShape.tags,
  origin: SeedOriginSchema,
  notes: assetVersionBaseShape.notes.default(''),
};

/** A Remotion composition of the absorbed `@ace/video` package; content is its source folder. */
const TemplateSeedEntrySchema = z
  .object({
    ...entryBaseShape,
    type: z.literal('template'),
    sourceFolder: RelativePathSchema,
    details: TemplateDetailsSchema.omit({ inputSchema: true, sceneSchema: true }),
    /** JSON Schema files under `seeds/templates/`, mirroring the composition's zod props. */
    inputSchemaFile: RelativePathSchema,
    sceneSchemaFile: RelativePathSchema.nullable(),
  })
  .strict();

/** The brand palette; content is the canonical JSON of `details`. */
const BrandKitSeedEntrySchema = z
  .object({ ...entryBaseShape, type: z.literal('brand-kit'), details: BrandKitDetailsSchema })
  .strict();

/** One folder of skills; each listed id is a sub-folder and becomes its own `skill` asset. */
const SkillSetSeedEntrySchema = z
  .object({
    type: z.literal('skill-set'),
    folder: RelativePathSchema,
    skillIds: z.array(AssetIdSchema).min(1).max(64),
    entryFile: RelativePathSchema,
    tags: assetVersionBaseShape.tags,
    origin: SeedOriginSchema,
  })
  .strict();

/** A remote voice provider configured by NAMES only: credential, voice id and model id variables. */
const ProviderVoiceSeedEntrySchema = z
  .object({
    ...entryBaseShape,
    type: z.literal('provider-voice'),
    provider: z.literal('elevenlabs'),
    credential: z.enum(SECRET_NAMES),
    voiceIdVariable: EnvironmentNameSchema,
    modelIdVariable: EnvironmentNameSchema,
    /** Public model id used when the model variable is unset; not a secret. */
    defaultModelId: z.string().regex(/^[A-Za-z0-9._:/-]{1,128}$/),
  })
  .strict();

/**
 * A biometric voice sample, registered by reference only (ADR 0003 decision 2). The kind,
 * sensitivity and storage mode are fixed by the seed, not configurable here.
 */
const VoiceReferenceSeedEntrySchema = z
  .object({
    ...entryBaseShape,
    type: z.literal('voice-reference'),
    language: z.enum(['pt', 'en']),
    referenceFile: RelativePathSchema,
    mimeType: z.enum(['audio/wav', 'audio/x-wav']),
  })
  .strict();

/** A licensed track copied into the store; the credit line is read from the credits file at seed time. */
const MusicSeedEntrySchema = z
  .object({
    ...entryBaseShape,
    type: z.literal('music'),
    sourceFile: RelativePathSchema,
    mimeType: z.literal('audio/mpeg'),
    author: z.string().min(1).max(200),
    details: MusicDetailsSchema,
    license: LicenseSchema.omit({ terms: true }),
    credits: z.object({ file: RelativePathSchema, lineIncludes: z.string().min(1).max(200) }).strict(),
    /** License restrictions as read, appended after the credit line in `license.terms`. */
    termsNote: z.string().max(3000),
  })
  .strict();

const SeedEntrySchema = z.discriminatedUnion('type', [
  TemplateSeedEntrySchema,
  BrandKitSeedEntrySchema,
  SkillSetSeedEntrySchema,
  ProviderVoiceSeedEntrySchema,
  VoiceReferenceSeedEntrySchema,
  MusicSeedEntrySchema,
]);
export type SeedEntry = z.infer<typeof SeedEntrySchema>;
export type TemplateSeedEntry = z.infer<typeof TemplateSeedEntrySchema>;
export type BrandKitSeedEntry = z.infer<typeof BrandKitSeedEntrySchema>;
export type SkillSetSeedEntry = z.infer<typeof SkillSetSeedEntrySchema>;
export type ProviderVoiceSeedEntry = z.infer<typeof ProviderVoiceSeedEntrySchema>;
export type VoiceReferenceSeedEntry = z.infer<typeof VoiceReferenceSeedEntrySchema>;
export type MusicSeedEntry = z.infer<typeof MusicSeedEntrySchema>;

function assetIdsOf(entry: SeedEntry): readonly string[] {
  return entry.type === 'skill-set' ? entry.skillIds : [entry.assetId];
}

export const SeedManifestSchema = z
  .object({
    format: z.literal('studio-catalog-seed'),
    version: z.literal(1),
    owner: assetVersionBaseShape.owner,
    /** Optional folders authored by R1-15; absent or empty folders load nothing. */
    recipesFolder: RelativePathSchema,
    promptsFolder: RelativePathSchema,
    entries: z.array(SeedEntrySchema).min(1).max(200),
  })
  .strict()
  .refine(
    (manifest) => {
      const ids = manifest.entries.flatMap(assetIdsOf);
      return new Set(ids).size === ids.length;
    },
    { message: 'every seeded asset id must be unique', path: ['entries'] },
  );
export type SeedManifest = z.infer<typeof SeedManifestSchema>;

/** `seeds/prompts/<name>.prompt.json`: a catalog `prompt` asset; the text lives in `textFile`. */
export const SeedPromptFileSchema = z
  .object({
    assetId: AssetIdSchema,
    name: assetVersionBaseShape.name,
    summary: assetVersionBaseShape.summary.default(''),
    tags: assetVersionBaseShape.tags.default([]),
    /** Relative to the prompts folder. */
    textFile: RelativePathSchema,
    mimeType: z.enum(['text/markdown', 'text/plain']).default('text/markdown'),
    variables: PromptDetailsSchema.shape.variables,
    /** Omitted: `created-here` by the manifest owner. */
    provenance: ProvenanceSchema.optional(),
    notes: assetVersionBaseShape.notes.default(''),
  })
  .strict();
export type SeedPromptFile = z.infer<typeof SeedPromptFileSchema>;

/**
 * `seeds/recipes/<name>.recipe.json`: a C2 recipe draft (every field except id, version, status
 * and timestamps). A binding may omit `contentHash`; the seed pins it from the seeded catalog
 * version, so recipe authors never copy hashes by hand.
 */
export const SeedRecipeFileSchema = z
  .object({
    recipeId: RecipeIdSchema,
    definition: z.record(z.string(), z.unknown()),
  })
  .strict();
export type SeedRecipeFile = z.infer<typeof SeedRecipeFileSchema>;

/** File-name suffixes the seed loads from the optional folders; anything else is ignored. */
export const PROMPT_FILE_SUFFIX = '.prompt.json';
export const RECIPE_FILE_SUFFIX = '.recipe.json';
