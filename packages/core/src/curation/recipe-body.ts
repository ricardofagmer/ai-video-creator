import { type Provenance } from '@studio/shared/catalog';
import { type CurationId } from '@studio/shared/curation';
import { RecipeSchema, canonicalJson, type Recipe } from '@studio/shared/recipes';
import { recipeDefinitionOf, type RecipeDefinition } from '../recipes/recipe-definition';

/** Lifecycle and identity-of-version fields that are never part of a curated recipe body (B14). */
const NON_BODY_FIELDS = ['version', 'status', 'provenance', 'createdAt', 'updatedAt'] as const;

/** A recipe definition as the Curator sees and proposes it: no `version`, `status` or `provenance`. */
export type RecipeBody = Omit<RecipeDefinition, 'version' | 'provenance'>;

export type ParsedRecipeBody = { status: 'valid'; body: RecipeBody } | { status: 'invalid' };

/** Provenance of every version saved from a proposal (SPEC 0005 section 5.7, AC 35). */
export function curatorProvenance(curationId: CurationId, author: string, at: Date): Provenance {
  return { source: { type: 'curator', curationId }, author, capturedAt: at.toISOString() };
}

/**
 * The text body of a recipe subject (SPEC 0005 section 5.3, B14): the canonical definition JSON
 * (sorted keys) without `version`, `status` and `provenance`, indented by two spaces so the
 * line-based diff shows changed fields rather than one changed line.
 */
export function recipeBodyOf(recipe: Recipe): string {
  const canonical: unknown = JSON.parse(canonicalJson(bodyOf(recipeDefinitionOf(recipe))));
  return JSON.stringify(canonical, null, 2);
}

/** Field by field, so a C2 field added later fails to compile here instead of slipping into the body. */
function bodyOf(definition: RecipeDefinition): RecipeBody {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    owner: definition.owner,
    notes: definition.notes,
    graph: definition.graph,
    bindings: definition.bindings,
    format: definition.format,
    gates: definition.gates,
    inputs: definition.inputs,
    checks: definition.checks,
    limits: definition.limits,
    rubric: definition.rubric,
    checklist: definition.checklist,
    allowedKinds: definition.allowedKinds,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether `newBody` is a valid recipe body for `subject` (check `recipe-json-valid`): JSON of one
 * object, none of the lifecycle fields, the same recipe `id`, and valid against the C2 recipe
 * schema once the studio's fields are added back as a `draft` with curator provenance.
 */
export function parseRecipeBody(newBody: string, subject: Recipe, curationId: CurationId): ParsedRecipeBody {
  let candidate: unknown;
  try {
    candidate = JSON.parse(newBody);
  } catch {
    // Not JSON: the check fails by id; the parser's message would quote model text.
    return { status: 'invalid' };
  }
  if (!isPlainObject(candidate)) return { status: 'invalid' };
  if (NON_BODY_FIELDS.some((field) => Object.hasOwn(candidate, field))) return { status: 'invalid' };
  if (candidate['id'] !== subject.id) return { status: 'invalid' };
  const now = new Date();
  const parsed = RecipeSchema.safeParse({
    ...candidate,
    version: subject.version + 1,
    status: 'draft',
    provenance: curatorProvenance(curationId, subject.owner, now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  if (!parsed.success) return { status: 'invalid' };
  return { status: 'valid', body: bodyOf(recipeDefinitionOf(parsed.data)) };
}
