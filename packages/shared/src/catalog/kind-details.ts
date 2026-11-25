import { z } from 'zod';
import { JsonObjectSchema } from '../common/json';
import { KebabIdSchema, RelativePathSchema } from '../common/ids';
import { AssetRefSchema, TagSchema } from './asset-kind';
import { AspectRatioSchema, CanvasSchema, DurationRangeSchema, FpsSchema, HexColorSchema } from './media';
import { TemplateEngineSchema } from './template-engine';

/** Kind-specific fields of PRD 5.2, one schema per `AssetKind`. */

export const TemplateDetailsSchema = z
  .object({
    /** Engine rules live in `@studio/shared/hyperframes`, never as a refinement here (SPEC 0008 K13). */
    engine: TemplateEngineSchema,
    compositionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'expected a composition id'),
    canvas: CanvasSchema,
    aspect: AspectRatioSchema,
    fps: FpsSchema,
    duration: DurationRangeSchema,
    /** JSON Schema of the composition props; it becomes WriterPacket.templateInputSchema. */
    inputSchema: JsonObjectSchema,
    /** JSON Schema of one scene; it becomes DirectorPacket.templateSceneSchema. Null when the template has no scene list. */
    sceneSchema: JsonObjectSchema.nullable(),
    /** Allowed camera moves and transitions; the agent protocol (C7) narrows them to its enums. */
    cameraMoves: z.array(KebabIdSchema).max(32),
    transitions: z.array(KebabIdSchema).max(32),
  })
  .strict();
export type TemplateDetails = z.infer<typeof TemplateDetailsSchema>;

/** Environment variable or Keychain item NAME; the value is never stored (PRD 12). */
const SecretNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'expected an UPPER_SNAKE_CASE name');

/** "model id reference (never a secret)": a public id, or the name of where the value lives. */
export const ModelIdReferenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('literal'), value: z.string().regex(/^[A-Za-z0-9._:/-]{1,128}$/) }).strict(),
  z.object({ type: z.literal('env'), name: SecretNameSchema }).strict(),
  z.object({ type: z.literal('keychain'), name: SecretNameSchema }).strict(),
]);
export type ModelIdReference = z.infer<typeof ModelIdReferenceSchema>;

/** A local model's path is the version's by-reference `storage.absolutePath`, not a second field. */
export const AiModelDetailsSchema = z
  .object({
    modelType: z.enum(['voice-clone', 'avatar', 'checkpoint', 'lora', 'provider-model']),
    provider: z.enum(['anthropic', 'elevenlabs', 'local-voice', 'other']),
    modelIdRef: ModelIdReferenceSchema,
    /**
     * Public id of the provider's speech model for this voice (ElevenLabs: `eleven_multilingual_v2`),
     * where `modelIdRef` names the voice itself. Absent means the watcher's configured default.
     */
    voiceModelId: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,128}$/)
      .optional(),
  })
  .strict();
export type AiModelDetails = z.infer<typeof AiModelDetailsSchema>;

export const ReferenceDetailsSchema = z
  .object({
    /** `website`: an https page URL saved for the site analysis step (site analysis spec, 2026-11-23). */
    subKind: z.enum(['video', 'image', 'audio', 'style', 'screenshot-set', 'text', 'website']),
    referenceNotes: z.string().max(4000),
  })
  .strict();
export type ReferenceDetails = z.infer<typeof ReferenceDetailsSchema>;

const variableShape = {
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, 'expected an identifier'),
  description: z.string().max(300),
  required: z.boolean(),
};

/** PRD 5.2: "`prompt` declares `variables[]` with types and defaults". */
export const PromptVariableSchema = z.discriminatedUnion('type', [
  z.object({ ...variableShape, type: z.literal('string'), default: z.string().max(4000).nullable() }).strict(),
  z.object({ ...variableShape, type: z.literal('number'), default: z.number().finite().nullable() }).strict(),
  z.object({ ...variableShape, type: z.literal('boolean'), default: z.boolean().nullable() }).strict(),
  z
    .object({ ...variableShape, type: z.literal('string-list'), default: z.array(z.string().max(1000)).max(100).nullable() })
    .strict(),
]);
export type PromptVariable = z.infer<typeof PromptVariableSchema>;

export const PromptDetailsSchema = z
  .object({
    variables: z
      .array(PromptVariableSchema)
      .max(32)
      .refine((variables) => new Set(variables.map((variable) => variable.name)).size === variables.length, {
        message: 'prompt variable names must be unique',
      }),
  })
  .strict();
export type PromptDetails = z.infer<typeof PromptDetailsSchema>;

/** A skill is a folder asset; its `contentHash` is the hash of the canonical folder manifest. */
export const SkillDetailsSchema = z
  .object({
    entryFile: RelativePathSchema,
    description: z.string().max(1000),
  })
  .strict();
export type SkillDetails = z.infer<typeof SkillDetailsSchema>;

export const ImageDetailsSchema = z
  .object({
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    purpose: z.enum(['logo', 'still', 'background', 'cover', 'other']),
  })
  .strict();
export type ImageDetails = z.infer<typeof ImageDetailsSchema>;

/**
 * What a track sounds like: moods and instruments (docs/specs/2026-11-25-ai-music-choice-design.md).
 * A closed list, so the categories a preset asks for can be matched against the catalog's tracks.
 */
export const musicCategories = [
  'animated',
  'excited',
  'sad',
  'upset',
  'boring',
  'classic',
  'electronic',
  'thoughtful',
  'guitar',
  'acoustic-guitar',
  'piano',
  'voices',
  'calm',
  'happy',
  'epic',
  'cinematic',
  'lo-fi',
] as const;
export const MusicCategorySchema = z.enum(musicCategories);
export type MusicCategory = z.infer<typeof MusicCategorySchema>;

/** The most categories one track or one preset names. */
export const MUSIC_CATEGORIES_MAX = 8;

export const MusicCategoryListSchema = z
  .array(MusicCategorySchema)
  .max(MUSIC_CATEGORIES_MAX)
  .refine((categories) => new Set(categories).size === categories.length, { message: 'a category appears at most once' });

export const MusicDetailsSchema = z
  .object({
    durationMs: z.number().int().positive(),
    bpm: z.number().positive().max(400).nullable(),
    integratedLufs: z.number().min(-70).max(0).nullable(),
    /** Defaults to none so versions stored before categories existed stay valid. */
    categories: MusicCategoryListSchema.default([]),
  })
  .strict();
export type MusicDetails = z.infer<typeof MusicDetailsSchema>;

export const SfxDetailsSchema = z.object({ durationMs: z.number().int().positive() }).strict();
export type SfxDetails = z.infer<typeof SfxDetailsSchema>;

const percentSchema = z.number().min(0).max(100);

export const BrandKitDetailsSchema = z
  .object({
    colors: z.array(z.object({ name: z.string().min(1).max(40), hex: HexColorSchema }).strict()).min(1).max(32),
    fonts: z
      .array(
        z
          .object({
            family: z.string().min(1).max(100),
            role: z.enum(['heading', 'body', 'caption', 'mono']),
            ref: AssetRefSchema.nullable(),
          })
          .strict(),
      )
      .max(8),
    logoRefs: z.array(AssetRefSchema).max(8),
    captionStyle: z
      .object({
        fontFamily: z.string().min(1).max(100),
        fontSizePx: z.number().int().min(8).max(200),
        color: HexColorSchema,
        background: HexColorSchema.nullable(),
        maxLines: z.number().int().min(1).max(4),
      })
      .strict(),
    safeZones: z
      .array(
        z
          .object({
            aspect: AspectRatioSchema,
            topPercent: percentSchema,
            bottomPercent: percentSchema,
            leftPercent: percentSchema,
            rightPercent: percentSchema,
          })
          .strict(),
      )
      .max(3),
    /** Curated search hints injected into CatalogSearchTool (topology 3.3). */
    tagHints: z.array(TagSchema).max(32),
    toneOfVoice: z.string().max(4000),
    motionStyle: z.string().max(500),
  })
  .strict();
export type BrandKitDetails = z.infer<typeof BrandKitDetailsSchema>;
