import { z } from 'zod';
import { AssetKindSchema, AssetRefSchema, type AssetKind, type AssetRef, type AssetStatus } from '../catalog/asset-kind';
import { type TemplateDetails } from '../catalog/kind-details';
import { type Recipe } from './recipe';

/**
 * Composition rules (docs/specs/2026-11-23-guided-creation-design.md section 3): choices that
 * cannot make one video together. Pure and browser-safe, so the web screens and core run the same
 * checks. Conflicts carry ids and numbers only; the owner-facing sentences are the web's.
 */

/** Kinds with exactly one slot in a recipe: two of them in a cart cannot both be used. */
export const singleSlotKinds = ['ai-model', 'template', 'brand-kit', 'music'] as const satisfies readonly AssetKind[];
export const SingleSlotKindSchema = AssetKindSchema.extract([...singleSlotKinds]);
export type SingleSlotKind = z.infer<typeof SingleSlotKindSchema>;

/** A stage that cannot run without its binding, and the slot it needs. */
export const stageRequiredSlots = [
  { stageId: 'narration', slot: 'voice' },
  { stageId: 'music', slot: 'music' },
  { stageId: 'composition', slot: 'template' },
] as const;

export const CompositionConflictSchema = z.discriminatedUnion('rule', [
  z.object({ rule: z.literal('duplicate-kind'), kind: SingleSlotKindSchema, refs: z.array(AssetRefSchema).min(2).max(50) }).strict(),
  z
    .object({
      rule: z.literal('stage-needs-binding'),
      stageId: z.enum(['narration', 'music', 'composition']),
      slot: z.enum(['voice', 'music', 'template']),
    })
    .strict(),
  z
    .object({
      rule: z.literal('template-format-mismatch'),
      field: z.enum(['aspect', 'canvas', 'fps']),
      recipe: z.string().max(40),
      template: z.string().max(40),
    })
    .strict(),
  z
    .object({
      rule: z.literal('duration-outside-template'),
      /** `recipe-range`: the recipe's range never meets the template's. `run-target`: this run's target is outside it. */
      subject: z.enum(['recipe-range', 'run-target']),
      requestedMinSec: z.number().positive(),
      requestedMaxSec: z.number().positive(),
      templateMinSec: z.number().positive(),
      templateMaxSec: z.number().positive(),
    })
    .strict(),
]);
export type CompositionConflict = z.infer<typeof CompositionConflictSchema>;

/** The most conflicts one error body or screen lists. */
export const COMPOSITION_CONFLICTS_MAX = 20;

/** The recipe fields the rules read. */
export type RecipeCompositionFacts = Pick<Recipe, 'graph' | 'bindings' | 'format'>;

export interface CartCompositionItem {
  kind: AssetKind;
  ref: AssetRef;
  status: AssetStatus;
  /** True for an `ai-model` that is a voice; the recipe's one `ai-model` slot is the voice. */
  voice?: boolean;
}

/** An `ai-model` only competes for the voice slot when it is a voice (an avatar model does not). */
function competesForSlot(item: CartCompositionItem): boolean {
  return item.kind !== 'ai-model' || item.voice === true;
}

/**
 * Two or more active items of a single-slot kind. Only active versions can be pinned, so drafts
 * and deprecated rows never compete for the slot.
 */
export function cartConflicts(items: readonly CartCompositionItem[]): CompositionConflict[] {
  const conflicts: CompositionConflict[] = [];
  for (const kind of singleSlotKinds) {
    const refs = items.filter((item) => item.kind === kind && item.status === 'active' && competesForSlot(item)).map((item) => item.ref);
    if (refs.length > 1) conflicts.push({ rule: 'duplicate-kind', kind, refs });
  }
  return conflicts;
}

function canvasText(canvas: { width: number; height: number }): string {
  return `${canvas.width}x${canvas.height}`;
}

/**
 * Conflicts of a recipe on its own. `template` is the details of the version bound to the
 * `template` slot, or null when none is bound or it could not be read (then only the binding
 * rules run).
 */
export function recipeConflicts(recipe: RecipeCompositionFacts, template: TemplateDetails | null): CompositionConflict[] {
  const conflicts: CompositionConflict[] = [];
  const enabled = new Set(recipe.graph.stages.filter((stage) => stage.enabled).map((stage) => stage.stageId));
  const slots = new Set(recipe.bindings.map((binding) => binding.slot));
  for (const required of stageRequiredSlots) {
    if (enabled.has(required.stageId) && !slots.has(required.slot)) {
      conflicts.push({ rule: 'stage-needs-binding', stageId: required.stageId, slot: required.slot });
    }
  }
  if (template === null) return conflicts;
  const { format } = recipe;
  if (format.aspect !== template.aspect) {
    conflicts.push({ rule: 'template-format-mismatch', field: 'aspect', recipe: format.aspect, template: template.aspect });
  }
  if (format.canvas.width !== template.canvas.width || format.canvas.height !== template.canvas.height) {
    conflicts.push({ rule: 'template-format-mismatch', field: 'canvas', recipe: canvasText(format.canvas), template: canvasText(template.canvas) });
  }
  if (format.fps !== template.fps) {
    conflicts.push({ rule: 'template-format-mismatch', field: 'fps', recipe: String(format.fps), template: String(template.fps) });
  }
  if (format.duration.maxSec < template.duration.minSec || format.duration.minSec > template.duration.maxSec) {
    conflicts.push({
      rule: 'duration-outside-template',
      subject: 'recipe-range',
      requestedMinSec: format.duration.minSec,
      requestedMaxSec: format.duration.maxSec,
      templateMinSec: template.duration.minSec,
      templateMaxSec: template.duration.maxSec,
    });
  }
  return conflicts;
}

/** Conflicts of one run: the recipe's own, plus this run's target duration against the template. */
export function runConflicts(recipe: RecipeCompositionFacts, template: TemplateDetails | null, targetDurationSec: number): CompositionConflict[] {
  const conflicts = recipeConflicts(recipe, template);
  if (template !== null && (targetDurationSec < template.duration.minSec || targetDurationSec > template.duration.maxSec)) {
    conflicts.push({
      rule: 'duration-outside-template',
      subject: 'run-target',
      requestedMinSec: targetDurationSec,
      requestedMaxSec: targetDurationSec,
      templateMinSec: template.duration.minSec,
      templateMaxSec: template.duration.maxSec,
    });
  }
  return conflicts;
}
