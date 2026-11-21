import { hyperframesBounds, type StudioTemplateVariable } from './constants';
import { satisfiesFlatProperty, type FlatInputSchema } from './flat-input-schema';

/*
 * Variable resolution of a HyperFrames render (SPEC 0008 section 5.3, OD6 answer a). For each
 * property the template declares, the value is the first present of: the recipe's
 * `templateVariables`, the studio vocabulary, nothing (the template's own default applies).
 * Strings longer than the property allows are refused, never cut. Only declared names come out.
 */

export type HyperframesVariableValue = string | number | boolean;

export type TemplateVariableResolution =
  | { status: 'resolved'; variables: Readonly<Record<string, HyperframesVariableValue>> }
  | { status: 'refused'; reason: 'variable-missing' | 'variable-undeclared' | 'variable-type'; names: readonly string[] };

export interface TemplateVariableSources {
  schema: FlatInputSchema;
  /** `context.params.templateVariables` as the recipe stores it; checked here, not trusted. */
  recipeValues: unknown;
  /** The studio's own values for this run; a name the run cannot fill is left out. */
  vocabulary: Readonly<Partial<Record<StudioTemplateVariable, HyperframesVariableValue>>>;
}

function isVariableValue(value: unknown): value is HyperframesVariableValue {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function recipeEntries(recipeValues: unknown): Map<string, unknown> | null {
  if (recipeValues === undefined || recipeValues === null) return new Map();
  if (typeof recipeValues !== 'object' || Array.isArray(recipeValues)) return null;
  const entries = Object.entries(recipeValues);
  if (entries.length > hyperframesBounds.maxVariables) return null;
  return new Map(entries);
}

function vocabularyValue(sources: TemplateVariableSources, name: string): unknown {
  const entry = Object.entries(sources.vocabulary).find(([key]) => key === name);
  return entry?.[1];
}

export function resolveTemplateVariables(sources: TemplateVariableSources): TemplateVariableResolution {
  const recipe = recipeEntries(sources.recipeValues);
  if (recipe === null) return { status: 'refused', reason: 'variable-type', names: ['templateVariables'] };
  const declared = sources.schema.properties;
  const undeclared = [...recipe.keys()].filter((name) => !Object.hasOwn(declared, name));
  if (undeclared.length > 0) return { status: 'refused', reason: 'variable-undeclared', names: undeclared.sort() };

  const variables: Record<string, HyperframesVariableValue> = {};
  const wrongType: string[] = [];
  const missing: string[] = [];
  for (const [name, property] of Object.entries(declared)) {
    const value = recipe.has(name) ? recipe.get(name) : vocabularyValue(sources, name);
    if (value === undefined) {
      if (sources.schema.required.includes(name) && property.defaultValue === undefined) missing.push(name);
      continue;
    }
    if (!isVariableValue(value) || !satisfiesFlatProperty(property, value)) {
      wrongType.push(name);
      continue;
    }
    variables[name] = value;
  }
  if (wrongType.length > 0) return { status: 'refused', reason: 'variable-type', names: wrongType.sort() };
  if (missing.length > 0) return { status: 'refused', reason: 'variable-missing', names: missing.sort() };
  return { status: 'resolved', variables };
}
