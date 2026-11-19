import { type Prisma, type RecipeVersion as RecipeVersionRow } from '@prisma/client';
import { z } from 'zod';
import { type Sha256 } from '@studio/shared/catalog';
import { RecipeSchema, recipeRefOf, type Recipe, type RecipeRef } from '@studio/shared/recipes';
import { sha256Hex } from '../asset-store/hashing';
import { type HashedRecipeDefinition } from './recipe-definition';
import { RecipeRowCorruptError } from './recipes.errors';

/** A saved recipe version with its pin: what callers resolve `recipeId@version` to. */
export interface RecipeVersionView {
  ref: RecipeRef;
  contentHash: Sha256;
  recipe: Recipe;
}

const DefinitionFieldsSchema = z.record(z.string(), z.unknown());

function parseDefinitionJson(text: string, ref: RecipeRef): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new RecipeRowCorruptError(ref, { cause: error });
  }
  const fields = DefinitionFieldsSchema.safeParse(parsed);
  if (!fields.success) throw new RecipeRowCorruptError(ref);
  return fields.data;
}

/**
 * Row to C2 recipe plus pin. The stored JSON must still hash to the row's `contentHash` and agree
 * with the row's columns, so a tampered or drifted row never leaves the module.
 */
export function toRecipeVersionView(row: RecipeVersionRow): RecipeVersionView {
  const ref = recipeRefOf({ id: row.recipeId, version: row.version });
  if (sha256Hex(row.definitionJson) !== row.contentHash) throw new RecipeRowCorruptError(ref);
  const candidate: Record<string, unknown> = {
    ...parseDefinitionJson(row.definitionJson, ref),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  const parsed = RecipeSchema.safeParse(candidate);
  if (!parsed.success) throw new RecipeRowCorruptError(ref);
  const recipe = parsed.data;
  const columnsAgree =
    recipe.id === row.recipeId && recipe.version === row.version && recipe.name === row.name && recipe.owner === row.owner;
  if (!columnsAgree) throw new RecipeRowCorruptError(ref);
  return { ref, contentHash: row.contentHash, recipe };
}

/** C2 recipe to insert data; the (recipe_id, version) pair is unique, so N is never overwritten. */
export function toCreateData(recipe: Recipe, hashed: HashedRecipeDefinition): Prisma.RecipeVersionUncheckedCreateInput {
  return {
    recipeId: recipe.id,
    version: recipe.version,
    name: recipe.name,
    status: recipe.status,
    owner: recipe.owner,
    contentHash: hashed.contentHash,
    definitionJson: hashed.definitionJson,
    createdAt: new Date(recipe.createdAt),
    updatedAt: new Date(recipe.updatedAt),
  };
}
