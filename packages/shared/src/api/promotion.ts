import { z } from 'zod';
import { ComparisonIdSchema, IsoDateTimeSchema, RunIdSchema } from '../common/ids';

/**
 * Rev 3 (SPEC 0003 section 5.4): the recorded owner approval that made a version `active`, one
 * `promotion_approvals` row. `null` on a view of a version that is not active, and on one that was
 * active before the R2 migration (B15). `decidedBy` and `decidedAt` come from the session and the
 * server clock, never from a request body.
 */
export const PromotionApprovalViewSchema = z
  .object({
    approvalId: z.number().int().positive(),
    decidedBy: z.string().min(1).max(100),
    decidedAt: IsoDateTimeSchema,
    reason: z.string().max(1000),
    evidence: z
      .object({
        comparisonId: ComparisonIdSchema.nullable(),
        runIds: z.array(RunIdSchema).max(10),
      })
      .strict(),
    /** The version this approval deprecated; null when no version was active. */
    replacedVersion: z.number().int().min(1).nullable(),
    qualityScoreAtApproval: z.number().finite().min(1).max(5).nullable(),
    sampleSizeAtApproval: z.number().int().nonnegative(),
  })
  .strict();
export type PromotionApprovalView = z.infer<typeof PromotionApprovalViewSchema>;

/**
 * `POST /catalog/assets/:assetId/versions/:version/promotion` and
 * `POST /recipes/:recipeId/versions/:version/promotion` body. `acknowledgeRef` must equal the
 * `id@version` of the path, else 422 `promotion-ref-mismatch`. The reason may be empty and the
 * evidence is optional and informational (B16): named ids must exist, but no score, comparison
 * result or count is required or sufficient. One version per approval; there is no batch route.
 */
export const PromoteVersionRequestSchema = z
  .object({
    acknowledgeRef: z.string().min(1).max(100),
    reason: z.string().max(1000),
    evidence: z
      .object({
        comparisonId: ComparisonIdSchema.optional(),
        runIds: z.array(RunIdSchema).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PromoteVersionRequest = z.infer<typeof PromoteVersionRequestSchema>;
