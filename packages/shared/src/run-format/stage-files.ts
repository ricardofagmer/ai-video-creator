import { z } from 'zod';
import {
  EpochMsSchema,
  IsoDateTimeSchema,
  KebabIdSchema,
  LearningNoteIdSchema,
  RelativePathSchema,
  RunIdSchema,
  Sha256Schema,
} from '../common/ids';
import { JsonObjectSchema } from '../common/json';
import { AssetKindSchema, AssetRefSchema, MimeTypeSchema } from '../catalog/asset-kind';
import { LEARNING_NOTE_MAX_CHARS } from '../catalog/learning-note';
import { BindingSlotSchema } from '../recipes/recipe-parts';
import {
  CheckIdSchema,
  ModelIdSchema,
  ModelRoleSchema,
  OutputNameSchema,
  PhaseIdSchema,
  StageIdSchema,
} from './vocabulary';

/**
 * One model a stage used: the agent role and the provider model id. The single shape for "which
 * models ran" in the input manifest, the run manifest and the C6 executor result (SPEC 0002 rev 3).
 */
export const ModelUseSchema = z.object({ role: ModelRoleSchema, modelId: ModelIdSchema }).strict();
export type ModelUse = z.infer<typeof ModelUseSchema>;

/** An output of an earlier stage that this stage reads, pinned by hash. */
export const StageInputSchema = z
  .object({
    name: OutputNameSchema,
    fromStage: StageIdSchema,
    path: RelativePathSchema,
    contentHash: Sha256Schema,
  })
  .strict();
export type StageInput = z.infer<typeof StageInputSchema>;

/**
 * A file the `execute` step must leave non-empty (PRD 7.2 step 4 postcondition). Rev 4 (section
 * 13.6, A30): `optional: true` lets the output be absent; one that is present must still be a
 * non-empty regular file, and `record` hashes only the optional outputs that exist. Absent or
 * `false` means required, so every rev 3 stage brief validates and means the same. The list is
 * fixed in the brief at step `brief`, so an executor cannot mark an output optional at run time.
 */
export const DeclaredOutputSchema = z
  .object({
    name: OutputNameSchema,
    path: RelativePathSchema,
    mimeType: MimeTypeSchema,
    optional: z.boolean().optional(),
  })
  .strict();
export type DeclaredOutput = z.infer<typeof DeclaredOutputSchema>;

/** SPEC 0003 section 5.5, B18: the cap on learning-note text rendered into one stage brief. */
export const STAGE_BRIEF_LEARNINGS_MAX_CHARS = 4000;

/**
 * The learning notes one ref contributed to a stage brief: at most 10, newest first; `omitted`
 * counts the notes left out by the per-ref or per-brief cap. `slot` is null for a run reference.
 * Note text is untrusted data, rendered into `instructions` only inside `<untrusted>` blocks.
 */
const StageBriefLearningSchema = z
  .object({
    slot: BindingSlotSchema.nullable(),
    ref: AssetRefSchema,
    notes: z
      .array(
        z
          .object({
            noteId: LearningNoteIdSchema,
            text: z.string().min(1).max(LEARNING_NOTE_MAX_CHARS),
            sourceRunId: RunIdSchema,
          })
          .strict(),
      )
      .max(10),
    omitted: z.number().int().nonnegative(),
  })
  .strict();

/**
 * `stages/<NN>-<stageId>/brief.json`, written by the `brief` step from a template with no model
 * call (topology section 2, SPEC 0002 K1). Its postcondition is "exists and validates".
 */
export const StageBriefSchema = z
  .object({
    runId: RunIdSchema,
    stageNumber: z.number().int().min(1).max(99),
    stageId: StageIdSchema,
    phaseId: PhaseIdSchema,
    title: z.string().min(1).max(200),
    templateId: KebabIdSchema,
    renderedAt: IsoDateTimeSchema,
    /** Rendered instructions, Markdown. */
    instructions: z.string().max(20000),
    bindings: z.array(z.object({ slot: BindingSlotSchema, ref: AssetRefSchema }).strict()).max(64),
    inputs: z.array(StageInputSchema).max(100),
    checks: z.array(CheckIdSchema).max(CheckIdSchema.options.length),
    declaredOutputs: z.array(DeclaredOutputSchema).max(100),
    /**
     * SPEC 0003 (R2): the learning notes rendered into this brief, with the run's cutoff applied.
     * Absent means "rendered before R2", so every rev 4 brief still validates.
     */
    learnings: z
      .array(StageBriefLearningSchema)
      .max(64)
      .refine(
        (entries) =>
          entries.reduce((total, entry) => total + entry.notes.reduce((sum, note) => sum + note.text.length, 0), 0) <=
          STAGE_BRIEF_LEARNINGS_MAX_CHARS,
        { message: `learning note text in one brief is capped at ${STAGE_BRIEF_LEARNINGS_MAX_CHARS} characters` },
      )
      .optional(),
  })
  .strict();
export type StageBrief = z.infer<typeof StageBriefSchema>;

/**
 * `stages/<NN>-<stageId>/input-manifest.json`, written by the `snapshot` step: the exact asset
 * versions, hashes, inputs, parameters and models the stage runs with (ADR 0003 decision 4).
 * By-reference assets appear by ref and hash only, never by path. Models are known only once the
 * executor ran, so `snapshot` writes `models: []` and the engine adds the models the executor
 * reported after `execute` (SPEC 0002 rev 3).
 */
export const StageInputManifestSchema = z
  .object({
    runId: RunIdSchema,
    stageNumber: z.number().int().min(1).max(99),
    stageId: StageIdSchema,
    attempt: z.number().int().min(1),
    createdAt: IsoDateTimeSchema,
    briefHash: Sha256Schema,
    assets: z
      .array(
        z
          .object({
            slot: BindingSlotSchema,
            ref: AssetRefSchema,
            kind: AssetKindSchema,
            contentHash: Sha256Schema,
            sizeBytes: z.number().int().nonnegative(),
            storage: z.enum(['store', 'reference']),
          })
          .strict(),
      )
      .max(64),
    inputs: z.array(StageInputSchema).max(100),
    parameters: JsonObjectSchema,
    models: z.array(ModelUseSchema).max(10),
  })
  .strict();
export type StageInputManifest = z.infer<typeof StageInputManifestSchema>;

/** `checks/<NN>-<stageId>/<checkId>-<attempt>.json`: one `verify`-step check result. */
export const CheckResultSchema = z
  .object({
    checkId: CheckIdSchema,
    stageNumber: z.number().int().min(1).max(99),
    stageId: StageIdSchema,
    attempt: z.number().int().min(1),
    outcome: z.enum(['passed', 'failed', 'error', 'skipped']),
    expected: z.string().max(500),
    measured: z.string().max(500),
    detail: z.string().max(2000),
    startedAtMs: EpochMsSchema,
    durationMs: z.number().int().nonnegative(),
    /** Raw command output beside the result (`<checkId>-<attempt>.log`), redacted; null when none. */
    rawOutputPath: RelativePathSchema.nullable(),
  })
  .strict();
export type CheckResult = z.infer<typeof CheckResultSchema>;
