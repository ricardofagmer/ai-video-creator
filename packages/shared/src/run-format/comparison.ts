import { z } from 'zod';
import { ComparisonIdSchema, IsoDateTimeSchema, RunIdSchema, Sha256Schema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { RecipeRefSchema } from '../recipes/recipe';
import { BindingSlotSchema } from '../recipes/recipe-parts';

export { ComparisonIdSchema, type ComparisonId } from '../common/ids';

/**
 * The id part of `<id>@<version>`. Not `parseAssetRef`: zod runs refinements on values whose
 * string checks failed, so this must not throw on a malformed ref.
 */
function versionedId(ref: string): string {
  return ref.slice(0, ref.lastIndexOf('@'));
}

/**
 * What an A/B comparison compares (SPEC 0003 section 5.3, B14): two versions of the asset bound in
 * one recipe slot, or two versions of one recipe. `a` is the arm-A version, `b` the arm-B version.
 * Rules: `a !== b`; both refs name the same asset id (`asset-binding`) or recipe id
 * (`recipe-version`). Asset and recipe refs share the `<id>@<version>` shape (SPEC 0002 A10).
 */
export const ComparisonSubjectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('asset-binding'), slot: BindingSlotSchema, a: AssetRefSchema, b: AssetRefSchema }).strict(),
    z.object({ kind: z.literal('recipe-version'), a: RecipeRefSchema, b: RecipeRefSchema }).strict(),
  ])
  .superRefine((subject, context) => {
    if (subject.a === subject.b) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['b'], message: 'a comparison needs two different versions' });
    }
    if (versionedId(subject.a) !== versionedId(subject.b)) {
      const what = subject.kind === 'asset-binding' ? 'asset' : 'recipe';
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['b'], message: `both versions must belong to the same ${what}` });
    }
  });
export type ComparisonSubject = z.infer<typeof ComparisonSubjectSchema>;

/**
 * `run.json.comparison` on both arms (section 5.3 "Link"). Absent on every ordinary run. Files win:
 * the run-index rebuild restores the `comparisons` row from the two links.
 * - `briefHash`: sha-256 of the canonical JSON of the brief, equal on both arms.
 * - `learningsCutoff`: the comparison's creation time; both arms render their stage briefs with
 *   the learning notes that existed then (section 5.5, B18).
 * - `costConsent`: null until `POST /comparisons/:comparisonId/start` accepted the pair's worst
 *   case; then written into both files before both runs move to `pending`.
 */
export const RunComparisonLinkSchema = z
  .object({
    comparisonId: ComparisonIdSchema,
    arm: z.enum(['a', 'b']),
    peerRunId: RunIdSchema,
    subject: ComparisonSubjectSchema,
    briefHash: Sha256Schema,
    learningsCutoff: IsoDateTimeSchema,
    costConsent: z
      .object({
        worstCaseUsd: z.number().nonnegative(),
        acceptedBy: z.string().min(1).max(100),
        acceptedAt: IsoDateTimeSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type RunComparisonLink = z.infer<typeof RunComparisonLinkSchema>;
