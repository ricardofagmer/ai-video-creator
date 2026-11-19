import { z } from 'zod';
import { ComparisonIdSchema, CurationIdSchema, IsoDateTimeSchema, RunIdSchema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { curationBounds } from '../curation/constants';
import { CurationCheckIdSchema, CurationReasonIdSchema, CurationStatusSchema } from '../curation/enums';
import { CurationDiffStatsSchema } from '../curation/proposal';
import { CuratableRefSchema, CurationSubjectSchema } from '../curation/subject';
import { BriefSchema } from '../recipes/brief';
import { RecipeRefSchema } from '../recipes/recipe';
import { BindingSlotSchema } from '../recipes/recipe-parts';
import { PageLimitQuerySchema, pageOf } from './common';

export const CurationParamsSchema = z.object({ curationId: CurationIdSchema }).strict();
export type CurationParams = z.infer<typeof CurationParamsSchema>;

/**
 * `POST /curations` (rev 4, SPEC 0005 section 4.4): the owner's "Pedir proposta ao curador".
 * `acceptedWorstCaseUsd` is the explicit cost consent and must equal `curationBounds.maxUsd`
 * ($1.00) to the cent, else 409 `curation-estimate-changed` (B3, Q2). Nothing is written and
 * nothing is spent on any refusal.
 */
export const CreateCurationRequestSchema = z
  .object({
    subject: CurationSubjectSchema,
    ownerFocus: z.string().trim().min(1).max(curationBounds.focusChars).optional(),
    acceptedWorstCaseUsd: z.number().nonnegative(),
  })
  .strict();
export type CreateCurationRequest = z.infer<typeof CreateCurationRequestSchema>;

/** `GET /curations` query: newest first, optionally only one subject version. */
export const ListCurationsQuerySchema = z
  .object({
    limit: PageLimitQuerySchema.optional(),
    cursor: CurationIdSchema.optional(),
    subjectRef: CuratableRefSchema.optional(),
  })
  .strict();
export type ListCurationsQuery = z.input<typeof ListCurationsQuerySchema>;

/**
 * `POST /curations/:curationId/decision`. `save-draft` saves the proposal as a new `draft` version
 * with provenance `curator`; `decline` records the owner's optional reason; `compare`, allowed only
 * after `save-draft`, creates (and does not start) a comparison with the saved draft as arm B.
 * `recipeRef` is arm A and, for a recipe subject, must be the subject ref; `slot` is required for
 * prompt and skill subjects. No action makes any version `active` (AC 35).
 */
export const CurationDecisionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save-draft') }).strict(),
  z
    .object({
      action: z.literal('decline'),
      reason: z.string().trim().min(1).max(curationBounds.declineReasonChars).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('compare'),
      recipeRef: RecipeRefSchema,
      slot: BindingSlotSchema.optional(),
      brief: BriefSchema,
      references: z.array(AssetRefSchema).max(50).optional(),
      title: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
]);
export type CurationDecisionRequest = z.infer<typeof CurationDecisionRequestSchema>;

/**
 * `GET /curations/:curationId` and every other curation answer. `queuePosition` is set only while
 * the status is `requested`. `proposal` is set only for `proposed`; `decision` once the owner
 * saved or declined. Proposal text, reasons and diffs are rendered as text, never as HTML.
 */
export const CurationViewSchema = z
  .object({
    curationId: CurationIdSchema,
    status: CurationStatusSchema,
    subject: CurationSubjectSchema.extend({ title: z.string().max(200) }).strict(),
    ownerFocus: z.string().max(curationBounds.focusChars).nullable(),
    requestedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable(),
    queuePosition: z.number().int().min(1).max(curationBounds.maxQueued).nullable(),
    reasonId: CurationReasonIdSchema.nullable(),
    failedChecks: z.array(CurationCheckIdSchema).max(CurationCheckIdSchema.options.length),
    noChangeReason: z.string().max(1000).nullable(),
    spentUsd: z.number().nonnegative(),
    proposal: z
      .object({
        diff: z.string().max(curationBounds.diffChars),
        diffStats: CurationDiffStatsSchema,
        changeSummary: z.string().max(600),
        reason: z.string().max(1000),
        expectedEffect: z.string().max(300),
        evidenceRunIds: z.array(RunIdSchema).min(1).max(curationBounds.maxEvidence),
        suggestComparison: z.boolean(),
      })
      .strict()
      .nullable(),
    decision: z
      .object({
        action: z.enum(['saved', 'declined']),
        savedRef: CuratableRefSchema.nullable(),
        comparisonId: ComparisonIdSchema.nullable(),
        ownerReason: z.string().max(curationBounds.declineReasonChars).nullable(),
        decidedAt: IsoDateTimeSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type CurationView = z.infer<typeof CurationViewSchema>;

export const CurationPageViewSchema = pageOf(CurationViewSchema);
export type CurationPageView = z.infer<typeof CurationPageViewSchema>;
