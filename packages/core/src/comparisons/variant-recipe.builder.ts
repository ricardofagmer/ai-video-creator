import { type AssetRef, type Sha256 } from '@studio/shared/catalog';
import { type BindingSlot, type Recipe } from '@studio/shared/recipes';
import { type ComparisonId } from '@studio/shared/run-format';
import { type RecipeDraftInput } from '../recipes';
import { comparableRecipeDefinition } from './comparison-verification';

export interface VariantRecipeFacts {
  /** Arm A's recipe version as saved. */
  base: Recipe;
  slot: BindingSlot;
  /** `subject.b` and its `contentHash` as the catalog holds it. */
  compared: { ref: AssetRef; contentHash: Sha256 };
  comparisonId: ComparisonId;
  /** The session owner who created the comparison. */
  author: string;
  now: Date;
}

/**
 * Arm B's recipe definition (B12): arm A's, field by field, except the binding in `slot`, which
 * pins `subject.b` with its catalog `contentHash`, and the provenance, which names the comparison.
 * `SaveRecipeVersionCommand` allocates N+1 and saves it as `draft`; nothing else differs, so the
 * two frozen definitions differ only in `version`, `provenance` and that binding (R2-AC-12).
 */
export function buildVariantDefinition(facts: VariantRecipeFacts): RecipeDraftInput {
  const { base } = facts;
  return {
    name: base.name,
    description: base.description,
    owner: base.owner,
    provenance: {
      source: { type: 'comparison', comparisonId: facts.comparisonId },
      author: facts.author,
      capturedAt: facts.now.toISOString(),
    },
    notes: base.notes,
    graph: base.graph,
    bindings: base.bindings.map((binding) =>
      binding.slot === facts.slot
        ? { slot: binding.slot, ref: facts.compared.ref, contentHash: facts.compared.contentHash }
        : binding,
    ),
    format: base.format,
    gates: base.gates,
    inputs: base.inputs,
    checks: base.checks,
    limits: base.limits,
    rubric: base.rubric,
    checklist: base.checklist,
    allowedKinds: base.allowedKinds,
  };
}

/**
 * B12 reuse: a saved version is the same variant when it was saved by a comparison, differs from
 * `base` only in `version`, `provenance` and the binding in `slot`, and pins `subject.b` with its
 * hash there. The comparison id in its provenance is the first comparison that saved it.
 */
export function isReusableVariant(candidate: Recipe, facts: Pick<VariantRecipeFacts, 'base' | 'slot' | 'compared'>): boolean {
  if (candidate.provenance?.source.type !== 'comparison' || candidate.version === facts.base.version) return false;
  const pinned = candidate.bindings.find((binding) => binding.slot === facts.slot);
  return (
    pinned !== undefined &&
    pinned.ref === facts.compared.ref &&
    pinned.contentHash === facts.compared.contentHash &&
    comparableRecipeDefinition(candidate, facts.slot) === comparableRecipeDefinition(facts.base, facts.slot)
  );
}
