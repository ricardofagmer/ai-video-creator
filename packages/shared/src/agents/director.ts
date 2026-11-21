import { z } from 'zod';
import { KebabIdSchema } from '../common/ids';
import { JsonObjectSchema } from '../common/json';
import { AssetRefSchema } from '../catalog/asset-kind';
import { packetBaseShape } from './packet-base';
import {
  BindingSummarySchema,
  BrandKitSummarySchema,
  CameraMoveSchema,
  LearningNotesBlockSchema,
  TransitionSchema,
} from './packet-parts';
import {
  ASSET_VISUAL,
  CAPTURE_VISUAL,
  DIRECT_SCENES_TASK,
  OutputContractSchema,
  TITLE_CARD_VISUAL,
} from './protocol';
import { SceneIdSchema, ScriptOutputSchema } from './writer';

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
