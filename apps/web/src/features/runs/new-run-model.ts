import { type RecipeVersionView } from '@studio/shared/api';
import { BriefSchema, missingBriefInputs, type Brief, type Recipe } from '@studio/shared/recipes';
import { type WebMessages } from '@/messages';

/** The inline error texts of the brief fields (`t.runs.brief.errors`). */
export type BriefErrorTexts = WebMessages['runs']['brief']['errors'];

/** Owner-typed values of the new-run form (design/telas/07 "Nova execução"). */
export interface NewRunFormValues {
  recipeRef: string;
  topic: string;
  sourceUrl: string;
  /** One key message per line. */
  keyMessages: string;
  targetDurationSec: string;
}

export type NewRunField = keyof NewRunFormValues;

export type NewRunErrors = Partial<Record<NewRunField, string>>;

/** Element ids of the form controls, used to focus the first invalid one. */
export const newRunFieldIds: Readonly<Record<NewRunField, string>> = {
  recipeRef: 'receita',
  topic: 'tema',
  sourceUrl: 'url-origem',
  keyMessages: 'mensagens-chave',
  targetDurationSec: 'duracao-alvo',
};

export const newRunFieldOrder: readonly NewRunField[] = ['recipeRef', 'topic', 'sourceUrl', 'keyMessages', 'targetDurationSec'];

export type BriefResult = { kind: 'valid'; brief: Brief } | { kind: 'invalid'; errors: NewRunErrors };

/** C2 `Brief.targetDurationSec` caps at 600 s whatever the recipe range says. */
const MAX_TARGET_DURATION_SEC = 600;

export function durationBounds(recipe: Recipe): { min: number; max: number } {
  const min = Math.max(1, Math.ceil(recipe.format.duration.minSec));
  const max = Math.min(MAX_TARGET_DURATION_SEC, Math.floor(recipe.format.duration.maxSec));
  return { min, max: Math.max(min, max) };
}

/** Default target: the top of the recipe's duration range (assumption, see the R1-20 return). */
export function defaultTargetDuration(recipe: Recipe): string {
  return String(durationBounds(recipe).max);
}

export function initialValues(recipe: RecipeVersionView | undefined): NewRunFormValues {
  return {
    recipeRef: recipe?.ref ?? '',
    topic: '',
    sourceUrl: '',
    keyMessages: '',
    targetDurationSec: recipe === undefined ? '' : defaultTargetDuration(recipe.recipe),
  };
}

function keyMessageLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function keyMessagesError(recipe: Recipe, t: BriefErrorTexts): string {
  const { min, max } = recipe.inputs.keyMessages;
  return t.keyMessagesCount(min, max);
}

/** Inline errors for the C2 `Brief` schema issues, by form field. */
function schemaErrors(issues: readonly { path: readonly PropertyKey[] }[], recipe: Recipe, t: BriefErrorTexts): NewRunErrors {
  const errors: NewRunErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === 'topic') errors.topic = t.topicLength;
    if (field === 'sourceUrl') errors.sourceUrl = t.sourceUrlFormat;
    if (field === 'keyMessages') errors.keyMessages = t.keyMessagesFormat;
    if (field === 'targetDurationSec') {
      const { min, max } = durationBounds(recipe);
      errors.targetDurationSec = t.durationRange(min, max);
    }
  }
  return errors;
}

/**
 * Builds the C2 `Brief` from the form and the chosen recipe: `format` and `language` come from
 * the recipe; the recipe's `inputs` decide which optional fields are required (PRD 6). The api
 * validates again and stays authoritative.
 */
export function buildBrief(values: NewRunFormValues, recipe: Recipe, t: BriefErrorTexts): BriefResult {
  const sourceUrl = values.sourceUrl.trim();
  const duration = /^[0-9]{1,4}$/.test(values.targetDurationSec.trim()) ? Number.parseInt(values.targetDurationSec.trim(), 10) : Number.NaN;
  const candidate = {
    topic: values.topic.trim(),
    ...(sourceUrl === '' ? {} : { sourceUrl }),
    keyMessages: keyMessageLines(values.keyMessages),
    format: recipe.format.aspect,
    language: recipe.format.language,
    targetDurationSec: duration,
  };
  const parsed = BriefSchema.safeParse(candidate);
  const errors: NewRunErrors = parsed.success ? {} : schemaErrors(parsed.error.issues, recipe, t);
  const { min, max } = durationBounds(recipe);
  if (errors.targetDurationSec === undefined && (!(duration >= min) || !(duration <= max))) {
    errors.targetDurationSec = t.durationRange(min, max);
  }
  if (parsed.success) {
    for (const field of missingBriefInputs(parsed.data, recipe.inputs)) {
      if (field === 'sourceUrl') errors.sourceUrl = t.sourceUrlRequired;
      if (field === 'keyMessages') errors.keyMessages = keyMessagesError(recipe, t);
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { kind: 'invalid', errors };
  return { kind: 'valid', brief: parsed.data };
}

/** The recipe asks for this optional brief field, or it can carry it (key messages allowed). */
export function asksSourceUrl(recipe: Recipe): boolean {
  return recipe.inputs.required.includes('sourceUrl');
}

export function asksKeyMessages(recipe: Recipe): boolean {
  return recipe.inputs.required.includes('keyMessages') || recipe.inputs.keyMessages.max > 0;
}
