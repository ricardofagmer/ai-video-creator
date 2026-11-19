import { z } from 'zod';
import { IsoDateTimeSchema, RelativePathSchema, RunIdSchema, SessionIdSchema, Sha256Schema } from '../common/ids';
import { JsonObjectSchema } from '../common/json';
import { AssetKindSchema, AssetRefSchema, SensitivitySchema } from '../catalog/asset-kind';
import { BriefSchema } from '../recipes/brief';
import { RecipePinSchema } from '../recipes/recipe';
import { BindingSlotSchema } from '../recipes/recipe-parts';
import { ModelUseSchema } from './stage-files';
import { StepKeySchema } from './step-key';
import { OutputNameSchema, ProviderNameSchema, StageIdSchema } from './vocabulary';

/** How much a call sent: a count in one unit, never the content (SPEC 0002 rev 3). */
export const EgressMeasureSchema = z
  .object({
    unit: z.enum(['characters', 'tokens', 'bytes', 'pages']),
    amount: z.number().int().nonnegative(),
  })
  .strict();
export type EgressMeasure = z.infer<typeof EgressMeasureSchema>;

/**
 * One item of "what left the machine" (PRD 7.4, 12): every payload sent to a provider. Report
 * readers list these; a biometric asset appears only when the owner confirmed that action. It is
 * also one line of `egress.jsonl`, appended through C5 on every external call (SPEC 0002 rev 3).
 */
export const EgressEntrySchema = z
  .object({
    provider: ProviderNameSchema,
    what: z.enum(['prompt-text', 'tts-text', 'audio', 'frames', 'page-fetch']),
    stepKey: StepKeySchema,
    sessionId: SessionIdSchema.nullable(),
    at: IsoDateTimeSchema,
    /** Short redacted description, e.g. "roteiro, 1.240 caracteres". */
    summary: z.string().max(300),
    /**
     * Optional so a manifest written before rev 3 still validates (`format` stays 1); every rev 3
     * writer sets it.
     */
    measure: EgressMeasureSchema.optional(),
  })
  .strict();
export type EgressEntry = z.infer<typeof EgressEntrySchema>;

/** `egress.jsonl` and `manifest.json.egress` hold at most this many entries per run. */
export const MAX_EGRESS_ENTRIES = 1000;

/**
 * `runs/<runId>/manifest.json` (PRD 7.4, criterion 8): every bound `assetId@version` with its
 * hash, the recipe version, the parameters, the model ids, the hashed outputs and the egress list.
 * Written by the `package` stage before the run enters `review` (SPEC 0002 K5).
 */
export const RunManifestSchema = z
  .object({
    format: z.literal(1),
    runId: RunIdSchema,
    createdAt: IsoDateTimeSchema,
    recipe: RecipePinSchema,
    assets: z
      .array(
        z
          .object({
            slot: BindingSlotSchema,
            ref: AssetRefSchema,
            kind: AssetKindSchema,
            contentHash: Sha256Schema,
            sensitivity: SensitivitySchema,
          })
          .strict(),
      )
      .max(64),
    references: z.array(z.object({ ref: AssetRefSchema, contentHash: Sha256Schema }).strict()).max(50),
    parameters: z
      .object({
        brief: BriefSchema,
        stages: z.array(z.object({ stageId: StageIdSchema, params: JsonObjectSchema }).strict()).max(14),
      })
      .strict(),
    models: z.array(ModelUseSchema).max(10),
    outputs: z
      .array(
        z
          .object({
            name: OutputNameSchema,
            path: RelativePathSchema,
            contentHash: Sha256Schema,
            sizeBytes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(500),
    /** A copy of `egress.jsonl`, made by `package`. */
    egress: z.array(EgressEntrySchema).max(MAX_EGRESS_ENTRIES),
  })
  .strict();
export type RunManifest = z.infer<typeof RunManifestSchema>;
