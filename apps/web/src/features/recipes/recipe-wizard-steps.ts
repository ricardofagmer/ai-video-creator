import { BINDING_ID_PREFIX, recipeFieldIds } from './recipe-form-model';

/** The new-recipe wizard, one group of editor sections per step; the last step saves. */
export const recipeWizardSteps = ['identity', 'format', 'stages', 'bindings', 'rules', 'review'] as const;

export type RecipeWizardStep = (typeof recipeWizardSteps)[number];

const fieldsOfStep: Readonly<Record<RecipeWizardStep, readonly string[]>> = {
  identity: [recipeFieldIds.name, recipeFieldIds.recipeId, recipeFieldIds.description, recipeFieldIds.owner],
  format: [
    recipeFieldIds.width,
    recipeFieldIds.height,
    recipeFieldIds.fps,
    recipeFieldIds.durationMin,
    recipeFieldIds.durationMax,
    recipeFieldIds.language,
    recipeFieldIds.integratedLufs,
    recipeFieldIds.truePeakDbtp,
  ],
  stages: [recipeFieldIds.stages],
  bindings: [],
  rules: [],
  review: [],
};

/** The step that shows a field id, so a failed save can return the owner to it. */
export function stepOfField(fieldId: string): RecipeWizardStep {
  if (fieldId.startsWith(`${BINDING_ID_PREFIX}-`)) return 'bindings';
  return recipeWizardSteps.find((step) => fieldsOfStep[step].includes(fieldId)) ?? 'review';
}

/** The errors that block leaving `step`; errors of later steps wait until the owner gets there. */
export function errorsOfStep(errors: Readonly<Record<string, string>>, step: RecipeWizardStep): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([fieldId]) => stepOfField(fieldId) === step));
}

/** The earliest step holding one of `errors`, or null when there are none. */
export function firstStepWithErrors(errors: Readonly<Record<string, string>>): RecipeWizardStep | null {
  const steps = new Set(Object.keys(errors).map(stepOfField));
  return recipeWizardSteps.find((step) => steps.has(step)) ?? null;
}

/** Share of the wizard reached, counting the current step: step 1 of 6 is 17%, the last is 100%. */
export function wizardProgress(step: RecipeWizardStep): number {
  return Math.round(((recipeWizardSteps.indexOf(step) + 1) / recipeWizardSteps.length) * 100);
}
