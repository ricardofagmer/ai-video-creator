import { z } from 'zod';
import { ComparisonIdSchema, IsoDateTimeSchema, RunIdSchema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { BriefSchema } from '../recipes/brief';
import { RecipePinSchema, RecipeRefSchema } from '../recipes/recipe';
import { BindingSlotSchema } from '../recipes/recipe-parts';
import { ComparisonSubjectSchema } from '../run-format/comparison';
import { ReviewSubjectSchema, RunStatusSchema } from '../run-format/vocabulary';
import { PageLimitQuerySchema, pageOf } from './common';
import { RunArtifactAccessSchema } from './runs';

export const ComparisonParamsSchema = z.object({ comparisonId: ComparisonIdSchema }).strict();

/**
 * `POST /comparisons` (rev 3, SPEC 0003 section 5.3): two `draft` runs from one brief. Arm A runs
 * `recipeRef` as saved; `subject.b` names arm B: another version of the asset bound in `slot`
 * (the api saves a `draft` variant recipe version for it, B12) or another version of the same
 * recipe. Refusals: 422 `comparison-subject-invalid`, `comparison-biometric-refused` (B13).
 */
export const CreateComparisonRequestSchema = z
  .object({
    recipeRef: RecipeRefSchema,
    brief: BriefSchema,
    references: z.array(AssetRefSchema).max(50).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    subject: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('asset-binding'), slot: BindingSlotSchema, b: AssetRefSchema }).strict(),
      z.object({ kind: z.literal('recipe-version'), b: RecipeRefSchema }).strict(),
    ]),
  })
  .strict();
export type CreateComparisonRequest = z.infer<typeof CreateComparisonRequestSchema>;

/**
 * `POST /comparisons/:comparisonId/start`: the owner's consent to the pair's spend. It must equal
 * the recomputed `pairWorstCaseUsd` to the cent, else 409 `comparison-estimate-changed`. Other
 * refusals: 409 `comparison-not-startable`, 422 `comparison-over-month-ceiling`,
 * 503 `month-spend-unavailable` (the gate fails closed). After a refusal both runs stay `draft`.
 */
export const StartComparisonRequestSchema = z.object({ acceptedWorstCaseUsd: z.number().nonnegative() }).strict();
export type StartComparisonRequest = z.infer<typeof StartComparisonRequestSchema>;

/**
 * The D11 gate figures for both runs (B20). `runWorstCaseUsd` is the recipe's resolved
 * `costPerRunUsd` when a paid provider is live, `0` when every paid provider is mocked;
 * `pairWorstCaseUsd` is twice it. `expectedPairUsd` (display only) is twice the mean cost of the
 * recipe's last up to 5 reviewed paid runs, null when none. `monthToDateUsd` is null when the
 * month spend is unavailable.
 */
export const ComparisonEstimateSchema = z
  .object({
    runWorstCaseUsd: z.number().nonnegative(),
    pairWorstCaseUsd: z.number().nonnegative(),
    expectedPairUsd: z.number().nonnegative().nullable(),
    monthToDateUsd: z.number().nonnegative().nullable(),
    costPerRunUsd: z.number().nonnegative(),
    costPerMonthUsd: z.number().nonnegative(),
    withinMonthCeiling: z.boolean(),
  })
  .strict();
export type ComparisonEstimate = z.infer<typeof ComparisonEstimateSchema>;

/**
 * One arm, read from its run folder at request time. `comparedRef` is the compared version this
 * arm ran (an asset ref or a recipe ref). `qa`, `decision` and `comparedVersionScore` are null
 * until they exist; `artifactAccess` follows the rev 4 rule of `GET /runs/:runId`.
 */
export const ComparisonArmViewSchema = z
  .object({
    arm: z.enum(['a', 'b']),
    runId: RunIdSchema,
    status: RunStatusSchema,
    recipe: RecipePinSchema,
    comparedRef: z.union([AssetRefSchema, RecipeRefSchema]),
    artifactAccess: RunArtifactAccessSchema,
    costUsd: z.number().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    recoveries: z.number().int().nonnegative(),
    qa: z.object({ outcome: z.enum(['passed', 'passed-with-warnings']), warnings: z.number().int().nonnegative() }).strict().nullable(),
    reviewerScores: z
      .array(z.object({ subject: ReviewSubjectSchema, overall: z.number().min(1).max(5) }).strict())
      .max(ReviewSubjectSchema.options.length),
    decision: z.object({ outcome: z.enum(['approved', 'rejected']), rating: z.number().int().min(1).max(5) }).strict().nullable(),
    comparedVersionScore: z
      .object({
        qualityScore: z.number().finite().min(1).max(5).nullable(),
        qualitySampleSize: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ComparisonArmView = z.infer<typeof ComparisonArmViewSchema>;

/**
 * `GET /comparisons/:comparisonId` (and the create and start responses). `status`: `draft` while
 * both runs are `draft`; `ready` when both are `review`, `approved` or `rejected` with a
 * `manifest.json`; `incomplete` when either is `failed`, or `rejected` without a manifest;
 * `running` otherwise. `verified` flags are shown as a warning when any is false. `pairCostUsd` is
 * the sum of both arms' costs. No control here changes a version's status.
 */
export const ComparisonViewSchema = z
  .object({
    comparisonId: ComparisonIdSchema,
    title: z.string().min(1).max(200),
    createdAt: IsoDateTimeSchema,
    createdBy: z.string().min(1).max(100),
    subject: ComparisonSubjectSchema,
    status: z.enum(['draft', 'running', 'ready', 'incomplete']),
    estimate: ComparisonEstimateSchema,
    verified: z
      .object({ sameBrief: z.boolean(), sameReferences: z.boolean(), onlyComparedDiffers: z.boolean() })
      .strict(),
    arms: z.object({ a: ComparisonArmViewSchema, b: ComparisonArmViewSchema }).strict(),
    pairCostUsd: z.number().nonnegative(),
  })
  .strict();
export type ComparisonView = z.infer<typeof ComparisonViewSchema>;

export const ComparisonPageSchema = pageOf(ComparisonViewSchema);
export type ComparisonPageView = z.infer<typeof ComparisonPageSchema>;

/** `GET /comparisons` query: newest first. */
export const ListComparisonsQuerySchema = z
  .object({
    limit: PageLimitQuerySchema.optional(),
    cursor: ComparisonIdSchema.optional(),
  })
  .strict();
export type ListComparisonsQuery = z.input<typeof ListComparisonsQuerySchema>;
