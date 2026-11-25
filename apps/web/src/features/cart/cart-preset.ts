import { stageRequiredSlots, type CompositionConflict } from '@studio/shared/recipes';
import { mandatoryStages, type StageId } from '@studio/shared/run-format';
import { browserStudioClient } from '@/lib/api';
import { bindingOptionOf } from '@/features/recipes/binding-option';
import { recipeFormConflicts } from '@/features/recipes/recipe-composition';
import {
  buildRecipeDefinition,
  emptyRecipeForm,
  recipeIdFromName,
  type BindingOption,
  type DefinitionResult,
  type RecipeFormValues,
} from '@/features/recipes/recipe-form-model';
import { editorKinds, slotsForStages } from '@/features/recipes/recipe-slots';
import { type WebMessages } from '@/messages';
import { fillSlotsFromCart } from './cart-bindings';
import { type CartItem } from './cart-store';

/** What the owner types at checkout to save the cart as a preset. */
export interface CartPresetFields {
  name: string;
  description: string;
  owner: string;
}

/**
 * The versions a preset may pin, read in the browser: the same two searches as the preset editor's
 * server loader (active versions, plus draft skills for the writer), without that editor's kept pins.
 */
export async function loadCartPresetOptions(): Promise<BindingOption[]> {
  const [page, draftSkills] = await Promise.all([
    browserStudioClient.searchAssets({ kinds: editorKinds, statuses: ['active'], sensitivity: 'any', limit: 100 }),
    browserStudioClient.searchAssets({ kinds: ['skill'], statuses: ['draft'], sensitivity: 'exclude-biometric', limit: 100 }),
  ]);
  return [...page.items, ...draftSkills.items].map(bindingOptionOf);
}

// Stages that add to a video but are not needed to make one: with no cart item for their slot, checkout turns them off.
const OPTIONAL_WHEN_UNBOUND: readonly StageId[] = ['music'];

/** The cart's template format, so a 9:16 or short template is not checked against the 16:9 defaults. */
function withTemplateFormat(values: RecipeFormValues, options: readonly BindingOption[]): RecipeFormValues {
  const ref = values.bindings.template ?? '';
  const template = options.find((option) => option.ref === ref && option.kind === 'template')?.templateDetails;
  if (template === undefined) return values;
  return {
    ...values,
    width: String(template.canvas.width),
    height: String(template.canvas.height),
    fps: String(template.fps),
    durationMin: String(template.duration.minSec),
    durationMax: String(template.duration.maxSec),
  };
}

function withoutUnboundOptionalStages(values: RecipeFormValues): RecipeFormValues {
  const unbound = new Set<StageId>(
    stageRequiredSlots.filter((required) => OPTIONAL_WHEN_UNBOUND.includes(required.stageId) && (values.bindings[required.slot] ?? '') === '').map((required) => required.stageId),
  );
  return { ...values, enabledStages: values.enabledStages.filter((stageId) => !unbound.has(stageId)) };
}

/**
 * A new preset from the cart: the cart's items in their slots, the cart template's format, optional
 * stages the cart has nothing for turned off, and the conflicts that would still stop a video.
 */
export function cartPresetDefinition(
  fields: CartPresetFields,
  cart: readonly CartItem[],
  options: readonly BindingOption[],
  t: WebMessages,
): { recipeId: string; result: DefinitionResult; conflicts: CompositionConflict[] } {
  const values = { ...emptyRecipeForm(t.recipes.defaults), name: fields.name.trim(), description: fields.description.trim(), owner: fields.owner.trim() };
  const recipeId = recipeIdFromName(values.name);
  const enabled = new Set<StageId>([...values.enabledStages, ...mandatoryStages]);
  const fill = fillSlotsFromCart(slotsForStages(enabled), cart, options, values.bindings, values.writerSkills, enabled.has('script'));
  const filled = withoutUnboundOptionalStages(withTemplateFormat({ ...values, recipeId, bindings: fill.bindings, writerSkills: fill.writerSkills }, options));
  const result = buildRecipeDefinition(filled, options, true, t.recipes);
  return { recipeId, result, conflicts: recipeFormConflicts(filled, options) };
}
