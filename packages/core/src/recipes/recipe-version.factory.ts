import { z } from 'zod';
import { RecipeIdSchema, RecipeSchema, type Recipe, type RecipeId } from '@studio/shared/recipes';
import { type InputIssue } from '../catalog';
import { type RecipeLifecycleField } from './recipe-definition';
import { InvalidRecipeInputError } from './recipes.errors';

/** Fields the studio sets; versions are allocated and promoted, never chosen by a caller (PRD 5.4). */
type RecipeSystemField = 'id' | 'version' | RecipeLifecycleField;
const SYSTEM_FIELDS: readonly RecipeSystemField[] = ['id', 'version', 'status', 'createdAt', 'updatedAt'];

/** Owner-supplied C2 recipe fields of a new version; validated whole by `buildDraftRecipe`. */
export type RecipeDraftInput = Omit<z.input<typeof RecipeSchema>, RecipeSystemField>;

const DraftFieldsSchema = z.record(z.string(), z.unknown());

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseRecipeInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidRecipeInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}

export function parseRecipeId(input: unknown): RecipeId {
  return parseRecipeInput(RecipeIdSchema, input, 'recipeId');
}

export interface NewRecipeVersionFacts {
  recipeId: RecipeId;
  version: number;
  /** Untrusted; must not carry system fields. */
  definition: unknown;
  now: Date;
}

/**
 * Assembles a `draft` version and validates it whole with C2, so the cross-field rules (stage
 * order, mandatory stages, defined checks, unique slots, canvas ratio) hold before a row exists.
 */
export function buildDraftRecipe(facts: NewRecipeVersionFacts): Recipe {
  const fields = parseRecipeInput(DraftFieldsSchema, facts.definition, 'definition');
  const supplied = SYSTEM_FIELDS.filter((field) => Object.hasOwn(fields, field));
  if (supplied.length > 0) {
    throw new InvalidRecipeInputError(supplied.map((field) => ({ path: `definition.${field}`, message: 'set by the studio; omit it' })));
  }
  const timestamp = facts.now.toISOString();
  const candidate: Record<string, unknown> = {
    ...fields,
    id: facts.recipeId,
    version: facts.version,
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return parseRecipeInput(RecipeSchema, candidate, 'definition');
}
