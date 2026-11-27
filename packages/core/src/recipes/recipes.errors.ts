import { type AssetRef, type AssetStatus } from '@studio/shared/catalog';
import { COMPOSITION_CONFLICTS_MAX, type BindingSlot, type CompositionConflict, type RecipeRef } from '@studio/shared/recipes';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type RecipesErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/**
 * Base of every recipes domain error. Messages carry ids and refs only, never definition content,
 * so they are safe to log and to show (PRD 12).
 */
export abstract class RecipesError extends Error {
  abstract readonly category: RecipesErrorCategory;
}

export class InvalidRecipeInputError extends RecipesError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid recipe input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidRecipeInputError';
  }
}

export class RecipeNotFoundError extends RecipesError {
  override readonly category = 'not_found';

  constructor(readonly recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = 'RecipeNotFoundError';
  }
}

export class RecipeVersionNotFoundError extends RecipesError {
  override readonly category = 'not_found';

  constructor(readonly ref: RecipeRef) {
    super(`Recipe version not found: ${ref}`);
    this.name = 'RecipeVersionNotFoundError';
  }
}

export class RecipeAlreadyExistsError extends RecipesError {
  override readonly category = 'conflict';

  constructor(readonly recipeId: string) {
    super(`Recipe already exists: ${recipeId}; save a new version instead`);
    this.name = 'RecipeAlreadyExistsError';
  }
}

/** Two writers raced for the same N+1 or the same activation; the caller may retry. */
export class RecipeVersionConflictError extends RecipesError {
  override readonly category = 'conflict';

  constructor(readonly recipeId: string) {
    super(`Concurrent change to recipe ${recipeId}; retry`);
    this.name = 'RecipeVersionConflictError';
  }
}

export class InvalidRecipeStatusTransitionError extends RecipesError {
  override readonly category = 'conflict';

  constructor(
    readonly ref: RecipeRef,
    readonly from: AssetStatus,
    readonly to: AssetStatus,
  ) {
    super(`${ref} cannot move from ${from} to ${to}`);
    this.name = 'InvalidRecipeStatusTransitionError';
  }
}

export type BindingProblemKind = 'unknown-asset-version' | 'hash-differs';

export interface BindingProblem {
  slot: BindingSlot;
  ref: AssetRef;
  problem: BindingProblemKind;
}

/** PRD 5.4 rule 4: every binding pins a catalog version that exists with exactly that hash. */
export class RecipeBindingInvalidError extends RecipesError {
  override readonly category = 'validation';

  constructor(readonly problems: readonly BindingProblem[]) {
    super(`Recipe bindings do not match the catalog: ${problems.map((item) => `${item.slot}=${item.ref} (${item.problem})`).join('; ')}`);
    this.name = 'RecipeBindingInvalidError';
  }
}

/**
 * 422 `composition-conflict` (guided-creation design section 3): the recipe, or the run asked of
 * it, breaks a composition rule of `@studio/shared/recipes` (a stage on without what it needs, a
 * template whose format or duration range does not fit). `conflicts` carries ids and numbers only,
 * capped at `COMPOSITION_CONFLICTS_MAX`; the web builds the owner's message from them. The api
 * puts them in `ApiError.details.conflicts`.
 */
export class CompositionConflictError extends RecipesError {
  override readonly category = 'validation';
  readonly reason = 'composition-conflict';
  readonly conflicts: readonly CompositionConflict[];

  constructor(conflicts: readonly CompositionConflict[]) {
    const kept = conflicts.slice(0, COMPOSITION_CONFLICTS_MAX);
    super(`Composition conflicts: ${kept.map((conflict) => conflict.rule).join(', ')}`);
    this.name = 'CompositionConflictError';
    this.conflicts = kept;
  }
}

/** A stored row no longer satisfies C2 or its hash; a data-integrity problem, never a user error. */
export class RecipeRowCorruptError extends RecipesError {
  override readonly category = 'internal';

  /** `subject` is a `recipeId@version` ref. */
  constructor(readonly subject: string, options?: ErrorOptions) {
    super(`Recipe row ${subject} does not match the recipe contract`, options);
    this.name = 'RecipeRowCorruptError';
  }
}
