import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type CreateComparisonRequest } from '@studio/shared/api';
import { type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { missingBriefInputs, type Brief, type Recipe } from '@studio/shared/recipes';
import { ComparisonSubjectSchema, type ComparisonSubject } from '@studio/shared/run-format';
import { AssetVersionNotFoundError, GetAssetVersionQuery } from '../catalog';
import {
  GetRecipeVersionQuery,
  RUNNABLE_RECIPE_STATUSES,
  RecipeBindingVerifier,
  RecipeVersionNotFoundError,
  type RecipeVersionView,
} from '../recipes';
import { BriefInputsMissingError, RecipeNotRunnableError, RunReferenceNotFoundError } from '../runs';
import { ComparisonBiometricRefusedError, ComparisonSubjectInvalidError } from './comparisons.errors';

type AssetBindingSubject = Extract<ComparisonSubject, { kind: 'asset-binding' }>;
type RecipeVersionSubject = Extract<ComparisonSubject, { kind: 'recipe-version' }>;

/** Arm B still has to be saved as a draft variant of `base` (B12). */
export interface ResolvedAssetBinding {
  kind: 'asset-binding';
  subject: AssetBindingSubject;
  base: RecipeVersionView;
  /** `subject.b` as the catalog holds it; its `contentHash` is pinned in the variant. */
  comparedVersion: AssetVersion;
}

/** Both arms are saved versions of one recipe; nothing is created (B14). */
export interface ResolvedRecipeVersion {
  kind: 'recipe-version';
  subject: RecipeVersionSubject;
  armA: RecipeVersionView;
  armB: RecipeVersionView;
}

export type ResolvedComparison = ResolvedAssetBinding | ResolvedRecipeVersion;

/**
 * Every check of section 5.3 "Validation at POST /comparisons", run before anything is written, so
 * a refusal creates no run and no recipe version (R2-AC-16): the subject, the biometric refusal
 * (B13), and the run-draft checks of `POST /runs` for each arm (runnable status, brief inputs,
 * binding pins, references). The run-draft service repeats its own checks when each arm is created.
 */
@Injectable()
export class ComparisonSubjectResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly bindings: RecipeBindingVerifier,
  ) {}

  async resolve(request: CreateComparisonRequest): Promise<ResolvedComparison> {
    const armA = await this.queryBus.execute(new GetRecipeVersionQuery(request.recipeRef));
    const resolved =
      request.subject.kind === 'asset-binding'
        ? await this.resolveAssetBinding(armA, request.subject.slot, request.subject.b)
        : await this.resolveRecipeVersion(armA, request.subject.b);
    await this.assertRunnable(armA, request.brief, 'a');
    if (resolved.kind === 'recipe-version') await this.assertRunnable(resolved.armB, request.brief, 'b');
    await this.assertReferencesExist(request.references ?? []);
    return resolved;
  }

  private async resolveAssetBinding(base: RecipeVersionView, slot: string, b: AssetRef): Promise<ResolvedAssetBinding> {
    const bound = base.recipe.bindings.find((binding) => binding.slot === slot);
    if (bound === undefined) throw new ComparisonSubjectInvalidError('slot-not-bound', `${base.ref} ${slot}`);
    const subject = this.parseSubject({ kind: 'asset-binding', slot, a: bound.ref, b });
    if (subject.kind !== 'asset-binding') throw new ComparisonSubjectInvalidError('not-a-comparable-pair', b);

    const boundVersion = await this.findAssetVersion(bound.ref);
    if (boundVersion?.sensitivity === 'biometric') throw new ComparisonBiometricRefusedError(bound.ref);
    const comparedVersion = await this.findAssetVersion(b);
    if (comparedVersion?.sensitivity === 'biometric') throw new ComparisonBiometricRefusedError(b);
    if (boundVersion === null) throw new ComparisonSubjectInvalidError('compared-version-not-found', bound.ref);
    if (comparedVersion === null) throw new ComparisonSubjectInvalidError('compared-version-not-found', b);
    if (comparedVersion.kind !== boundVersion.kind) throw new ComparisonSubjectInvalidError('kind-differs', b);
    return { kind: 'asset-binding', subject, base, comparedVersion };
  }

  private async resolveRecipeVersion(armA: RecipeVersionView, b: string): Promise<ResolvedRecipeVersion> {
    const subject = this.parseSubject({ kind: 'recipe-version', a: armA.ref, b });
    if (subject.kind !== 'recipe-version') throw new ComparisonSubjectInvalidError('not-a-comparable-pair', b);
    let armB: RecipeVersionView;
    try {
      armB = await this.queryBus.execute(new GetRecipeVersionQuery(subject.b));
    } catch (error) {
      if (error instanceof RecipeVersionNotFoundError) throw new ComparisonSubjectInvalidError('recipe-version-not-found', subject.b);
      throw error;
    }
    // The compared part of two recipe versions is every binding that is not the same pin in both.
    for (const ref of differingBindingRefs(armA.recipe, armB.recipe)) {
      if ((await this.findAssetVersion(ref))?.sensitivity === 'biometric') throw new ComparisonBiometricRefusedError(ref);
    }
    return { kind: 'recipe-version', subject, armA, armB };
  }

  private parseSubject(candidate: unknown): ComparisonSubject {
    const parsed = ComparisonSubjectSchema.safeParse(candidate);
    if (!parsed.success) throw new ComparisonSubjectInvalidError('not-a-comparable-pair', describeCandidate(candidate));
    return parsed.data;
  }

  /** The checks `POST /runs` makes, so the second arm cannot fail them after the first exists. */
  private async assertRunnable(view: RecipeVersionView, brief: Brief, arm: 'a' | 'b'): Promise<void> {
    if (!RUNNABLE_RECIPE_STATUSES.includes(view.recipe.status)) {
      if (arm === 'b') throw new ComparisonSubjectInvalidError('recipe-version-not-runnable', view.ref);
      throw new RecipeNotRunnableError(view.ref, view.recipe.status);
    }
    const missing = missingBriefInputs(brief, view.recipe.inputs);
    if (missing.length > 0) throw new BriefInputsMissingError(view.ref, missing);
    await this.bindings.verify(view.recipe);
  }

  private async assertReferencesExist(refs: readonly AssetRef[]): Promise<void> {
    const missing: AssetRef[] = [];
    for (const ref of refs) {
      if ((await this.findAssetVersion(ref)) === null) missing.push(ref);
    }
    if (missing.length > 0) throw new RunReferenceNotFoundError(missing);
  }

  private async findAssetVersion(ref: string): Promise<AssetVersion | null> {
    try {
      return await this.queryBus.execute(new GetAssetVersionQuery(ref));
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return null;
      throw error;
    }
  }
}

function differingBindingRefs(recipeA: Recipe, recipeB: Recipe): AssetRef[] {
  const pinsOf = (recipe: Recipe): Set<string> => new Set(recipe.bindings.map((binding) => `${binding.slot}=${binding.ref}`));
  const pinsA = pinsOf(recipeA);
  const pinsB = pinsOf(recipeB);
  const refs = new Set<AssetRef>();
  for (const binding of recipeA.bindings) if (!pinsB.has(`${binding.slot}=${binding.ref}`)) refs.add(binding.ref);
  for (const binding of recipeB.bindings) if (!pinsA.has(`${binding.slot}=${binding.ref}`)) refs.add(binding.ref);
  return [...refs];
}

/** Refs only, for the error message; never brief content. */
function describeCandidate(candidate: unknown): string {
  if (typeof candidate === 'object' && candidate !== null && 'a' in candidate && 'b' in candidate) {
    return `${String(candidate.a)} vs ${String(candidate.b)}`;
  }
  return 'subject';
}
