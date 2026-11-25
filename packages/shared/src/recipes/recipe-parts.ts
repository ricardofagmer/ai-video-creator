import { z } from 'zod';
import { KebabIdSchema, Sha256Schema } from '../common/ids';
import { JsonObjectSchema, type JsonObject } from '../common/json';
import { AssetRefSchema } from '../catalog/asset-kind';
import { MusicCategoryListSchema, type MusicCategory } from '../catalog/kind-details';
import { AspectRatioSchema, CanvasSchema, DurationRangeSchema, FpsSchema } from '../catalog/media';
import {
  CheckIdSchema,
  GateIdSchema,
  ReviewSubjectSchema,
  StageIdSchema,
  reservedGateIds,
} from '../run-format/vocabulary';
import { BriefFieldSchema, LanguageSchema } from './brief';

/**
 * Binding slot name. Well-known slots: `template`, `voice`, `brand-kit`, `music`, `prompt:<role>`,
 * `skill:<role>`, `model:<role>` (an `ai-model` provider-model version, the per-recipe model
 * override), `reference:<name>`, `image:<name>`, `sfx:<name>`.
 */
export const BindingSlotSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(:[a-z0-9-]+)?$/, 'expected slot or slot:name')
  .max(64);
export type BindingSlot = z.infer<typeof BindingSlotSchema>;

/** PRD 5.4 rule 4: a recipe pins `assetId@version` plus `contentHash`. */
export const BindingSchema = z
  .object({
    slot: BindingSlotSchema,
    ref: AssetRefSchema,
    contentHash: Sha256Schema,
  })
  .strict();
export type Binding = z.infer<typeof BindingSchema>;

/** PRD 6 `format`, plus the writing and caption parameters the recipe owns (topology 5, R1-10). */
export const RecipeFormatSchema = z
  .object({
    canvas: CanvasSchema,
    aspect: AspectRatioSchema,
    fps: FpsSchema,
    duration: DurationRangeSchema,
    language: LanguageSchema,
    loudness: z
      .object({
        integratedLufs: z.number().min(-40).max(-5),
        truePeakDbtp: z.number().min(-12).max(0),
        toleranceLu: z.number().positive().max(5),
      })
      .strict(),
    /** Caption band centre as a percent of frame height; the fixed 74% covered app buttons on 16:9. */
    captions: z
      .object({
        yPercent: z.number().min(0).max(100),
        maxLines: z.number().int().min(1).max(4),
      })
      .strict(),
    /** WriterPacket.constraints (topology section 5). */
    narration: z.object({ maxWordsPerSecond: z.number().positive().max(6) }).strict(),
    sceneCount: z
      .object({ min: z.number().int().min(1).max(100), max: z.number().int().min(1).max(100) })
      .strict()
      .refine((range) => range.min <= range.max, { message: 'sceneCount.min must not exceed max' }),
  })
  .strict();
export type RecipeFormat = z.infer<typeof RecipeFormatSchema>;

const plainCheck = <Id extends z.infer<typeof CheckIdSchema>>(id: Id) => z.object({ id: z.literal(id) }).strict();

/**
 * Per-recipe check definitions (PRD 7.3). Targets that the recipe format already states
 * (resolution, fps, duration range, loudness, true peak) are read from `format`, not repeated.
 */
export const RecipeCheckSchema = z.discriminatedUnion('id', [
  plainCheck('output-schema'),
  plainCheck('refs-resolve'),
  plainCheck('claims-evidence'),
  z.object({ id: z.literal('container'), formats: z.array(z.enum(['mp4', 'mov', 'webm'])).min(1).max(3) }).strict(),
  z
    .object({
      id: z.literal('codec'),
      video: z.enum(['h264', 'hevc', 'prores', 'vp9']),
      audio: z.enum(['aac', 'mp3', 'opus']),
    })
    .strict(),
  plainCheck('resolution'),
  plainCheck('fps'),
  plainCheck('duration'),
  plainCheck('loudness'),
  plainCheck('true-peak'),
  plainCheck('audio-present'),
  z.object({ id: z.literal('black-frames'), maxRunMs: z.number().int().positive().max(60000) }).strict(),
  z.object({ id: z.literal('caption-timing'), maxDriftMs: z.number().int().positive().max(5000) }).strict(),
  z.object({ id: z.literal('reviewer-score'), minOverall: z.number().min(1).max(5) }).strict(),
  plainCheck('outputs-present'),
]);
export type RecipeCheck = z.infer<typeof RecipeCheckSchema>;

/** One entry of `graph`: a stage switched on or off, its checks and executor parameters. */
export const RecipeStageSchema = z
  .object({
    stageId: StageIdSchema,
    enabled: z.boolean(),
    checks: z.array(CheckIdSchema).max(CheckIdSchema.options.length),
    /** Overrides `limits.commandTimeoutMs` for this stage; null keeps the run limit. */
    timeoutMs: z.number().int().min(1000).max(4 * 60 * 60 * 1000).nullable(),
    /** Executor parameters (toolbox command arguments, C9); each executor validates its own keys. */
    params: JsonObjectSchema,
  })
  .strict();
export type RecipeStage = z.infer<typeof RecipeStageSchema>;

/**
 * `params` of the `research` stage (site analysis spec, 2026-11-23). Passthrough because the
 * research executor may read other keys; `siteAnalysis` defaults on so older recipes gain it.
 */
export const ResearchStageParamsSchema = z.object({ siteAnalysis: z.boolean().default(true) }).passthrough();
export type ResearchStageParams = z.infer<typeof ResearchStageParamsSchema>;

/** Reads the research params; unknown or invalid input reads as the default (analysis on). */
export function researchStageParams(params: JsonObject): { siteAnalysis: boolean } {
  const parsed = ResearchStageParamsSchema.safeParse(params);
  return { siteAnalysis: parsed.success ? parsed.data.siteAnalysis : true };
}

/**
 * `params` of the `music` stage (docs/specs/2026-11-25-ai-music-choice-design.md). `track` mixes
 * the song bound to the `music` slot; `auto` picks one per video among the catalog tracks carrying
 * the categories, and none listed means any. Passthrough because the executor may read other keys;
 * the defaults keep recipes saved before the mode existed on `track`.
 */
export const MusicStageParamsSchema = z
  .object({ musicMode: z.enum(['track', 'auto']).default('track'), musicCategories: MusicCategoryListSchema.default([]) })
  .passthrough();
export type MusicStageParams = z.infer<typeof MusicStageParamsSchema>;

export type MusicChoice = { mode: 'track' } | { mode: 'auto'; categories: MusicCategory[] };

/** Reads the music params; unknown or invalid input reads as the default (the bound song). */
export function musicChoiceOf(params: JsonObject): MusicChoice {
  const parsed = MusicStageParamsSchema.safeParse(params);
  if (!parsed.success || parsed.data.musicMode === 'track') return { mode: 'track' };
  return { mode: 'auto', categories: parsed.data.musicCategories };
}

/** The music stage `params` that store a choice, keeping the stage's other keys. */
export function withMusicChoice(params: JsonObject, choice: MusicChoice): JsonObject {
  const rest = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'musicMode' && key !== 'musicCategories'));
  return choice.mode === 'track' ? rest : { ...rest, musicMode: 'auto', musicCategories: [...choice.categories] };
}

/** A human gate the recipe adds after a stage; `plan` and `final` always exist and are not listed. */
export const RecipeGateSchema = z
  .object({
    id: GateIdSchema.refine((id) => !reservedGateIds.includes(id), { message: 'plan and final are implicit gates' }),
    afterStage: StageIdSchema,
    /** Owner-facing, pt-BR (D16). */
    label: z.string().min(1).max(120),
    whatToDo: z.string().min(1).max(500),
  })
  .strict();
export type RecipeGate = z.infer<typeof RecipeGateSchema>;

/** PRD 6 `inputs`: what the brief must supply beyond topic, format, language and duration. */
export const RecipeInputsSchema = z
  .object({
    required: z.array(BriefFieldSchema).max(BriefFieldSchema.options.length),
    keyMessages: z
      .object({ min: z.number().int().min(0).max(10), max: z.number().int().min(0).max(10) })
      .strict()
      .refine((range) => range.min <= range.max, { message: 'keyMessages.min must not exceed max' }),
  })
  .strict();
export type RecipeInputs = z.infer<typeof RecipeInputsSchema>;

/** Topology section 5 ReviewPacket.rubric, with the subjects each criterion applies to. */
export const RubricCriterionSchema = z
  .object({
    criterionId: KebabIdSchema,
    description: z.string().min(1).max(500),
    weight: z.number().positive().max(100),
    threshold: z.number().min(1).max(5),
    subjects: z.array(ReviewSubjectSchema).min(1).max(ReviewSubjectSchema.options.length),
  })
  .strict();
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

/** Review checklist item (D14); labels are pt-BR. */
export const ChecklistItemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/, 'expected a checklist item id'),
    label: z.string().min(1).max(200),
    required: z.boolean(),
  })
  .strict();
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
