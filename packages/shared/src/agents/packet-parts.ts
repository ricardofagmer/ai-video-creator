import { z } from 'zod';
import { KebabIdSchema, LearningNoteIdSchema } from '../common/ids';
import { JsonObjectSchema } from '../common/json';
import { AssetKindSchema, AssetRefSchema } from '../catalog/asset-kind';
import { BrandKitDetailsSchema } from '../catalog/kind-details';
import { RecipeRefSchema } from '../recipes/recipe';
import { BindingSlotSchema, RecipeInputsSchema } from '../recipes/recipe-parts';
import { CheckIdSchema, ModelIdSchema, PhaseIdSchema, ProviderNameSchema, StageIdSchema } from '../run-format/vocabulary';
import { untrustedTextMaxChars } from './bounds';
import { UNTRUSTED_TAG, isDelimited } from './protocol';

/**
 * Packet parts that topology section 5 names but does not spell out. Each holds only the items
 * the topology comment lists beside it, built from R1-02 schemas; nothing else reaches an agent.
 */

/** `slot -> { ref, kind, title }`; no bytes, no biometric rows (the packet builder filters them). */
export const BindingSummarySchema = z
  .object({
    slot: BindingSlotSchema,
    ref: AssetRefSchema,
    kind: AssetKindSchema,
    title: z.string().max(200),
  })
  .strict();
export type BindingSummary = z.infer<typeof BindingSummarySchema>;

/** `ref, phases, stages (on/off), checks, inputs schema, rubric ref` of the bound recipe version. */
export const RecipeSummarySchema = z
  .object({
    ref: RecipeRefSchema,
    phases: z.array(PhaseIdSchema).max(PhaseIdSchema.options.length),
    stages: z
      .array(
        z
          .object({
            stageId: StageIdSchema,
            enabled: z.boolean(),
            checks: z.array(CheckIdSchema).max(CheckIdSchema.options.length),
          })
          .strict(),
      )
      .max(StageIdSchema.options.length),
    inputs: RecipeInputsSchema,
    /** The recipe version whose `rubric` the Reviewer applies; the criteria themselves stay out. */
    rubricRef: RecipeRefSchema,
  })
  .strict();
export type RecipeSummary = z.infer<typeof RecipeSummarySchema>;

/** Prices `per model / TTS / render second` from the versioned price table (R1-11). */
export const PriceTableSummarySchema = z
  .object({
    models: z
      .array(
        z
          .object({
            modelId: ModelIdSchema,
            inputUsdPerMillionTokens: z.number().nonnegative(),
            outputUsdPerMillionTokens: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(16),
    tts: z
      .array(z.object({ provider: ProviderNameSchema, usdPerCharacter: z.number().nonnegative() }).strict())
      .max(ProviderNameSchema.options.length),
    renderUsdPerSecond: z.number().nonnegative(),
  })
  .strict();
export type PriceTableSummary = z.infer<typeof PriceTableSummarySchema>;

/** `palette, fonts, logo ref, motion style` of the bound brand-kit version. */
export const BrandKitSummarySchema = z
  .object({
    palette: BrandKitDetailsSchema.shape.colors,
    fonts: BrandKitDetailsSchema.shape.fonts,
    logoRef: AssetRefSchema.nullable(),
    motionStyle: BrandKitDetailsSchema.shape.motionStyle,
  })
  .strict();
export type BrandKitSummary = z.infer<typeof BrandKitSummarySchema>;

/**
 * Text from an asset version or a captured page, already wrapped by the packet builder in one
 * delimiter block of the untrusted tag, with embedded tags escaped (topology section 8). Delimiting is data
 * hygiene, not authority: the content cannot change tools, allowlists or gates.
 */
export const UntrustedTextSchema = z
  .string()
  .max(untrustedTextMaxChars)
  .refine((text) => isDelimited(UNTRUSTED_TAG, text), {
    message: 'expected one untrusted delimiter block with escaped inner tags',
  });
export type UntrustedText = z.infer<typeof UntrustedTextSchema>;

/** Topology 0004 section 7: at most 64 learning-note entries reach one writer or director packet. */
export const PACKET_LEARNINGS_MAX_ENTRIES = 64;

/**
 * One learning note in a Scriptwriter or Scene director packet (topology 0004 section 5, SPEC 0005
 * section 4.3). The packet builder flattens `StageBrief.learnings` (already capped and cut off by
 * R2-07) and delimits each text with the attributes `ref` and `note`; `sourceRunId` is dropped (L6).
 */
export const PacketLearningNoteSchema = z
  .object({
    ref: z.union([AssetRefSchema, RecipeRefSchema]),
    noteId: LearningNoteIdSchema,
    text: UntrustedTextSchema,
  })
  .strict();
export type PacketLearningNote = z.infer<typeof PacketLearningNoteSchema>;

/**
 * `inputs.learnings` of the writer and director packets (topology 0004 section 4
 * `LearningNotesBlock`): required, `[]` when the stage brief has none. The notes are data from
 * the owner's past reviews, never instructions.
 */
export const LearningNotesBlockSchema = z.array(PacketLearningNoteSchema).max(PACKET_LEARNINGS_MAX_ENTRIES);
export type LearningNotesBlock = z.infer<typeof LearningNotesBlockSchema>;

/**
 * Camera move and transition ids. The bound template version lists the allowed ids
 * (`TemplateDetails.cameraMoves` / `transitions`); the packet narrows them per call in
 * `DirectorPacket.constraints`, and the engine re-checks every chosen id against that list.
 */
export const CameraMoveSchema = KebabIdSchema;
export type CameraMove = z.infer<typeof CameraMoveSchema>;
export const TransitionSchema = KebabIdSchema;
export type Transition = z.infer<typeof TransitionSchema>;

/**
 * Patch of the retry with params recovery action over the recipe stage `params`. Keys are checked by the engine against
 * the per-step allowlist before it applies anything; the agent never applies a patch itself.
 */
export const StepParamsPatchSchema = JsonObjectSchema;
export type StepParamsPatch = z.infer<typeof StepParamsPatchSchema>;
