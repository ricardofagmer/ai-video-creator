import { z } from 'zod';
import { IsoDateTimeSchema, KebabIdSchema, Sha256Schema } from '../common/ids';
import { canonicalJson } from '../common/json';
import { AssetKindSchema, AssetStatusSchema } from '../catalog/asset-kind';
import { ProvenanceSchema } from '../catalog/provenance';
import { LimitsOverrideSchema } from '../run-format/limits';
import { mandatoryStages, stageOrder } from '../run-format/vocabulary';
import { type Brief, type BriefField } from './brief';
import {
  BindingSchema,
  ChecklistItemSchema,
  RecipeCheckSchema,
  RecipeFormatSchema,
  RecipeGateSchema,
  RecipeInputsSchema,
  RecipeStageSchema,
  RubricCriterionSchema,
  type RecipeInputs,
} from './recipe-parts';

export const RecipeIdSchema = KebabIdSchema;
export type RecipeId = z.infer<typeof RecipeIdSchema>;

/** `recipeId@version`, the same shape as an asset reference (SPEC 0002 A10). */
export const RecipeRefSchema = z.string().regex(/^[a-z0-9-]+@\d+$/, 'expected recipeId@version');
export type RecipeRef = z.infer<typeof RecipeRefSchema>;

/** A recipe pinned by a run or a manifest: its ref plus the hash of its canonical JSON. */
export const RecipePinSchema = z.object({ ref: RecipeRefSchema, contentHash: Sha256Schema }).strict();
export type RecipePin = z.infer<typeof RecipePinSchema>;

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

/**
 * A versioned recipe (PRD 6 fields `graph`, `bindings`, `format`, `gates`, `inputs`; topology 3.2
 * fields `checks`, `limits`, `rubric`, `checklist`, `allowedKinds`). Versioned like assets: a saved
 * version is immutable and an edit creates version N+1 (PRD 5.4).
 */
export const RecipeSchema = z
  .object({
    id: RecipeIdSchema,
    version: z.number().int().min(1),
    name: z.string().min(1).max(200),
    description: z.string().max(2000),
    status: AssetStatusSchema,
    owner: z.string().min(1).max(100),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    provenance: ProvenanceSchema.nullable(),
    notes: z.string().max(10000),
    graph: z.object({ stages: z.array(RecipeStageSchema).min(1).max(stageOrder.length) }).strict(),
    bindings: z.array(BindingSchema).max(64),
    format: RecipeFormatSchema,
    gates: z.array(RecipeGateSchema).max(8),
    inputs: RecipeInputsSchema,
    checks: z.array(RecipeCheckSchema).max(32),
    limits: LimitsOverrideSchema,
    rubric: z.array(RubricCriterionSchema).max(20),
    checklist: z.array(ChecklistItemSchema).max(20),
    allowedKinds: z.array(AssetKindSchema).min(1).max(AssetKindSchema.options.length),
  })
  .strict()
  .superRefine((recipe, context) => {
    const issue = (path: (string | number)[], message: string): void =>
      context.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const stageIds = recipe.graph.stages.map((stage) => stage.stageId);
    const positions = stageIds.map((stageId) => stageOrder.indexOf(stageId));
    if (!unique(stageIds)) issue(['graph', 'stages'], 'a stage appears at most once');
    if (positions.some((position, index) => index > 0 && position <= (positions[index - 1] ?? -1))) {
      issue(['graph', 'stages'], 'stages must follow the canonical stage order');
    }
    const enabledStages = recipe.graph.stages.filter((stage) => stage.enabled).map((stage) => stage.stageId);
    for (const stageId of mandatoryStages) {
      if (!enabledStages.includes(stageId)) issue(['graph', 'stages'], `stage ${stageId} must be present and enabled`);
    }

    const checkIds = recipe.checks.map((check) => check.id);
    if (!unique(checkIds)) issue(['checks'], 'a check is defined at most once');
    recipe.graph.stages.forEach((stage, index) => {
      for (const checkId of stage.checks) {
        if (!checkIds.includes(checkId)) issue(['graph', 'stages', index, 'checks'], `check ${checkId} is not defined`);
      }
    });

    if (!unique(recipe.bindings.map((binding) => binding.slot))) issue(['bindings'], 'binding slots must be unique');
    if (!unique(recipe.gates.map((gate) => gate.id))) issue(['gates'], 'gate ids must be unique');
    recipe.gates.forEach((gate, index) => {
      if (!enabledStages.includes(gate.afterStage)) issue(['gates', index, 'afterStage'], 'gate follows a disabled stage');
    });
    if (!unique(recipe.rubric.map((criterion) => criterion.criterionId))) issue(['rubric'], 'criterion ids must be unique');
    if (!unique(recipe.checklist.map((item) => item.id))) issue(['checklist'], 'checklist ids must be unique');

    const [ratioWidth, ratioHeight] = recipe.format.aspect.split(':').map((part) => Number.parseInt(part, 10));
    const ratio = recipe.format.canvas.width / recipe.format.canvas.height;
    if (ratioWidth === undefined || ratioHeight === undefined || Math.abs(ratio - ratioWidth / ratioHeight) > 0.01) {
      issue(['format', 'canvas'], 'canvas does not match the aspect ratio');
    }
  });
export type Recipe = z.infer<typeof RecipeSchema>;

export function recipeRefOf(recipe: Pick<Recipe, 'id' | 'version'>): RecipeRef {
  return `${recipe.id}@${recipe.version}`;
}

/**
 * Recipe fields that change without a new version (they live in `recipe_versions` columns).
 * SPEC 0002 rev 2: they never enter the hashed definition, so promoting or deprecating a version
 * never changes its `contentHash`.
 */
type RecipeLifecycleField = 'status' | 'createdAt' | 'updatedAt';

/** Field by field, so a C2 field added later fails to compile here instead of escaping the hash. */
function recipeDefinitionOf(recipe: Recipe): Omit<Recipe, RecipeLifecycleField> {
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

/** The exact string whose sha-256 is a recipe version's `contentHash`: the definition only. */
export function recipeContentHashInput(recipe: Recipe): string {
  return canonicalJson(recipeDefinitionOf(recipe));
}

/** Brief fields the recipe requires but the brief lacks; empty when the brief satisfies `inputs`. */
export function missingBriefInputs(brief: Brief, inputs: RecipeInputs): BriefField[] {
  const missing: BriefField[] = [];
  if (inputs.required.includes('sourceUrl') && brief.sourceUrl === undefined) missing.push('sourceUrl');
  const messageCount = brief.keyMessages.length;
  const absent = inputs.required.includes('keyMessages') && messageCount === 0;
  const outOfRange = messageCount < inputs.keyMessages.min || messageCount > inputs.keyMessages.max;
  if (absent || outOfRange) missing.push('keyMessages');
  return missing;
}
