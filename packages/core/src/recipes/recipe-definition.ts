import { type Sha256 } from '@studio/shared/catalog';
import { canonicalJson, type Recipe } from '@studio/shared/recipes';
import { sha256Hex } from '../asset-store/hashing';

/**
 * Recipe fields that live in `recipe_versions` columns and may change without a new version.
 * SPEC 0002 rev 2: they never enter the definition, so promoting or deprecating a version (or the
 * timestamps that move with it) never changes its `contentHash`.
 */
export type RecipeLifecycleField = 'status' | 'createdAt' | 'updatedAt';

/** The immutable part of a recipe version: what `contentHash` covers and `definition_json` holds. */
export type RecipeDefinition = Omit<Recipe, RecipeLifecycleField>;

/** Field by field, so a C2 field added later fails to compile here instead of escaping the hash. */
export function recipeDefinitionOf(recipe: Recipe): RecipeDefinition {
  return {
    id: recipe.id,
    version: recipe.version,
    name: recipe.name,
    description: recipe.description,
    owner: recipe.owner,
    provenance: recipe.provenance,
    notes: recipe.notes,
    graph: recipe.graph,
    bindings: recipe.bindings,
    format: recipe.format,
    gates: recipe.gates,
    inputs: recipe.inputs,
    checks: recipe.checks,
    limits: recipe.limits,
    rubric: recipe.rubric,
    checklist: recipe.checklist,
    allowedKinds: recipe.allowedKinds,
  };
}

export interface HashedRecipeDefinition {
  /** Canonical JSON of the definition; stored verbatim in `definition_json`. */
  definitionJson: string;
  /** sha-256 of `definitionJson`. */
  contentHash: Sha256;
}

export function hashRecipeDefinition(recipe: Recipe): HashedRecipeDefinition {
  const definitionJson = canonicalJson(recipeDefinitionOf(recipe));
  return { definitionJson, contentHash: sha256Hex(definitionJson) };
}
