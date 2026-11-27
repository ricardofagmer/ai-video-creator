import { z } from 'zod';
import { KebabIdSchema } from '../common/ids';
import { JsonObjectSchema } from '../common/json';
import { AssetRefSchema } from '../catalog/asset-kind';
import { MusicCategoryListSchema } from '../catalog/kind-details';
import { packetBaseShape } from './packet-base';
import {
  BindingSummarySchema,
  BrandKitSummarySchema,
  CameraMoveSchema,
  LearningNotesBlockSchema,
  TransitionSchema,
  UntrustedTextSchema,
} from './packet-parts';
import {
  ASSET_VISUAL,
  CAPTURE_VISUAL,
  DIRECT_SCENES_TASK,
  OutputContractSchema,
  TITLE_CARD_VISUAL,
} from './protocol';
import { SceneIdSchema, ScriptOutputSchema, WRITER_SKILLS_MAX } from './writer';

/** The most catalog tracks one packet offers the director to pick the background music from. */
export const MUSIC_CANDIDATES_MAX = 30;

/**
 * One catalog track the director may pick as background music
 * (docs/specs/2026-11-25-ai-music-choice-design.md section 3). Metadata only, never the audio.
 */
export const MusicCandidateSchema = z
  .object({
    ref: AssetRefSchema,
    name: z.string().min(1).max(200),
    categories: MusicCategoryListSchema,
    bpm: z.number().positive().max(400).nullable(),
    durationMs: z.number().int().positive(),
  })
  .strict();
export type MusicCandidate = z.infer<typeof MusicCandidateSchema>;

/** The director's background-music pick: one of `inputs.music.candidates`, and why in one line. */
export const MusicPickSchema = z.object({ ref: AssetRefSchema, reason: z.string().min(1).max(200) }).strict();
export type MusicPick = z.infer<typeof MusicPickSchema>;

/**
 * Scene director answer (topology section 5). The engine re-resolves `citedRefs` at `verify`.
 * `captureId` must name an entry of `inputs.capturesIndex`; capture ids are lowercase kebab ids
 * (`capture-1`), so anything else is refused here instead of reaching the frame and render tools.
 */
export const ScenesOutputSchema = z
  .object({
    scenes: z
      .array(
        z
          .object({
            sceneId: SceneIdSchema,
            visual: z.discriminatedUnion('type', [
              z
                .object({
                  type: z.literal(CAPTURE_VISUAL),
                  captureId: KebabIdSchema,
                  inMs: z.number().int(),
                  outMs: z.number().int(),
                })
                .strict(),
              z.object({ type: z.literal(ASSET_VISUAL), ref: AssetRefSchema }).strict(),
              z.object({ type: z.literal(TITLE_CARD_VISUAL), text: z.string().max(80) }).strict(),
            ]),
            cameraMove: CameraMoveSchema,
            transition: TransitionSchema,
            onScreenText: z.string().max(80).optional(),
          })
          .strict(),
      )
      .min(1),
    citedRefs: z.array(AssetRefSchema),
    /** Present only when `inputs.music` was offered; the music stage re-checks it against the candidates. */
    musicPick: MusicPickSchema.optional(),
  })
  .strict();
export type ScenesOutput = z.infer<typeof ScenesOutputSchema>;

/** The director's own last scenes, carried inline on a retry (agents have no memory, topology section 6). */
export const ScenesOutputRefSchema = ScenesOutputSchema;
export type ScenesOutputRef = z.infer<typeof ScenesOutputRefSchema>;

/**
 * Scene director packet (topology section 5). Absent by construction (never sees): cost ledger,
 * Scriptwriter reasoning, biometric assets, credentials; and, since topology 0004 section 2,
 * retired notes, notes after the run's cutoff and notes on biometric versions.
 */
export const DirectorPacketSchema = z
  .object({
    ...packetBaseShape,
    task: z.literal(DIRECT_SCENES_TASK),
    inputs: z
      .object({
        /** The approved output only, never the Scriptwriter session. */
        script: ScriptOutputSchema,
        capturesIndex: z.array(
          z.object({ captureId: KebabIdSchema, label: z.string(), durationMs: z.number().int() }).strict(),
        ),
        templateSceneSchema: JsonObjectSchema,
        /** Recipe bindings; the tool layer grows the offered set with CatalogSearchTool results. */
        offeredRefs: z.array(BindingSummarySchema),
        /** Palette, fonts, logo ref, motion style. */
        brandKit: BrandKitSummarySchema,
        retryInstruction: z.string().min(1).optional(),
        previousOutput: ScenesOutputRefSchema.optional(),
        /** The run brief's `instructions`, delimited (images and prompts spec, 2026-11-23). */
        ownerInstructions: UntrustedTextSchema.optional(),
        /**
         * The research stage's SiteAnalysis as JSON, delimited (site analysis spec): third-party
         * page content, so data only; the owner's brief and instructions win over it.
         */
        siteAnalysis: UntrustedTextSchema.optional(),
        /**
         * The kept style analyses of the run's video references as JSON, delimited (guided-creation
         * spec): AI notes about third-party videos, so data only; the owner's brief and instructions win.
         */
        referenceAnalyses: UntrustedTextSchema.optional(),
        /**
         * Every reference the owner put on the run (any sub-kind) as JSON, delimited: name, sub-kind,
         * the owner's notes and the content of a text reference. Data only, and it must be used.
         */
        ownerReferences: UntrustedTextSchema.optional(),
        /** Bound skill asset versions (the role's `skill:director` slot, else every skill of the recipe), one delimited block each. */
        skillTexts: z.array(UntrustedTextSchema).min(1).max(WRITER_SKILLS_MAX).optional(),
        /**
         * Present when the preset's music mode is `auto` and more than one catalog track matches:
         * the categories the owner asked for (none means any) and the tracks to pick one from.
         */
        music: z
          .object({ categories: MusicCategoryListSchema, candidates: z.array(MusicCandidateSchema).min(2).max(MUSIC_CANDIDATES_MAX) })
          .strict()
          .optional(),
        /** Topology 0004 section 5: notes from `StageBrief.learnings`, delimited; `[]` when none. */
        learnings: LearningNotesBlockSchema,
      })
      .strict(),
    constraints: z
      .object({
        citeOnlyOfferedRefs: z.literal(true),
        /** Allowed subset from the bound template. */
        cameraMoves: z.array(CameraMoveSchema),
        transitions: z.array(TransitionSchema),
      })
      .strict(),
    outputContract: z.literal(OutputContractSchema.enum.ScenesOutput),
  })
  .strict()
  .readonly();
export type DirectorPacket = z.infer<typeof DirectorPacketSchema>;
