import { type TemplateDetails } from '@studio/shared/catalog';
import { recipeConflicts, type CompositionConflict, type RecipeCompositionFacts, type RecipeFormat } from '@studio/shared/recipes';
import { mandatoryStages, type StageId } from '@studio/shared/run-format';
import { defaultFormat } from './recipe-defaults';
import { aspectOf, bindingsOf, readNumber, stagesOf, type BindingOption, type RecipeFormValues } from './recipe-form-model';

/** A typed number, or the base value while the field cannot be read (the field shows its own error). */
function numberOr(text: string, fallback: number): number {
  const read = readNumber(text);
  return read.ok ? read.value : fallback;
}

/** The form as the composition rules read it: stages, pins and format, with the base filling unreadable numbers. */
function compositionFactsOf(values: RecipeFormValues, options: readonly BindingOption[]): RecipeCompositionFacts {
  const base: RecipeFormat = values.base?.format ?? defaultFormat;
  const stages = stagesOf(values);
  const enabled = new Set<StageId>([...stages.filter((stage) => stage.enabled).map((stage) => stage.stageId), ...mandatoryStages]);
  const width = numberOr(values.width, base.canvas.width);
  const height = numberOr(values.height, base.canvas.height);
  const aspect = width > 0 && height > 0 ? aspectOf(width, height) : null;
  return {
    graph: { stages },
    bindings: bindingsOf(values, options, enabled),
    format: {
      ...base,
      canvas: { width, height },
      aspect: aspect ?? base.aspect,
      fps: numberOr(values.fps, base.fps),
      duration: { minSec: numberOr(values.durationMin, base.duration.minSec), maxSec: numberOr(values.durationMax, base.duration.maxSec) },
      language: values.language,
    },
  };
}

/** Details of the template the form pins, when the editor knows them. */
function pinnedTemplateDetails(values: RecipeFormValues, options: readonly BindingOption[]): TemplateDetails | null {
  const ref = values.bindings.template ?? '';
  return options.find((option) => option.ref === ref && option.kind === 'template')?.templateDetails ?? null;
}

/**
 * What stops this form from making a video (guided-creation spec section 3), live while the owner
 * edits: a stage without its binding, or a format the pinned template cannot render.
 */
export function recipeFormConflicts(values: RecipeFormValues, options: readonly BindingOption[]): CompositionConflict[] {
  return recipeConflicts(compositionFactsOf(values, options), pinnedTemplateDetails(values, options));
}
