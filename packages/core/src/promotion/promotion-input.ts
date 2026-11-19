import { z } from 'zod';
import { AssetRefSchema, ComparisonIdSchema } from '@studio/shared/catalog';
import { RecipeRefSchema } from '@studio/shared/recipes';
import { CorrelationIdSchema, RunIdSchema } from '@studio/shared/run-format';
import { type InputIssue } from '../catalog';
import { InvalidPromotionInputError } from './promotion.errors';

/** C10 `PromoteVersionRequest` bounds, plus the fields the api sets from the session and path. */
const PromoteVersionInputSchema = z
  .object({
    target: z.enum(['asset-version', 'recipe-version']),
    ref: z.string().min(1).max(100),
    acknowledgeRef: z.string().min(1).max(100),
    reason: z.string().max(1000),
    evidence: z
      .object({
        comparisonId: ComparisonIdSchema.optional(),
        runIds: z.array(RunIdSchema).max(10).optional(),
      })
      .strict()
      .optional(),
    decidedBy: z.string().trim().min(1).max(100),
    correlationId: CorrelationIdSchema.nullable().optional(),
  })
  .strict();

/** Evidence as stored in `evidence_json` and shown in `PromotionApprovalView.evidence`. */
export interface PromotionEvidence {
  comparisonId: string | null;
  runIds: string[];
}

export type ParsedPromotionInput = Omit<z.output<typeof PromoteVersionInputSchema>, 'evidence' | 'correlationId'> & {
  evidence: PromotionEvidence;
  correlationId: string | null;
};

/** Paths and zod messages only: a zod message never quotes the rejected value. */
function issuesOf(error: z.ZodError): InputIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export function parsePromotionInput(input: unknown): ParsedPromotionInput {
  const parsed = PromoteVersionInputSchema.safeParse(input);
  if (!parsed.success) throw new InvalidPromotionInputError(issuesOf(parsed.error));
  const refSchema = parsed.data.target === 'asset-version' ? AssetRefSchema : RecipeRefSchema;
  if (!refSchema.safeParse(parsed.data.ref).success) {
    throw new InvalidPromotionInputError([{ path: 'ref', message: 'expected id@version' }]);
  }
  const runIds = [...new Set(parsed.data.evidence?.runIds ?? [])];
  return {
    target: parsed.data.target,
    ref: parsed.data.ref,
    acknowledgeRef: parsed.data.acknowledgeRef,
    reason: parsed.data.reason,
    decidedBy: parsed.data.decidedBy,
    evidence: { comparisonId: parsed.data.evidence?.comparisonId ?? null, runIds },
    correlationId: parsed.data.correlationId ?? null,
  };
}
