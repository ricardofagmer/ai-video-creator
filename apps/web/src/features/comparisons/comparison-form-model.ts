import { type AssetVersionView, type CreateComparisonRequest, type RecipeVersionView } from '@studio/shared/api';
import { assetRefPattern, formatAssetRef, parseAssetRef } from '@studio/shared/catalog';
import { type Recipe } from '@studio/shared/recipes';
import { slotLabel } from './comparison-labels';

export type ComparisonKind = CreateComparisonRequest['subject']['kind'];

/** What arm B changes, as the owner picks it on "Nova comparação". '' is "not chosen yet". */
export interface ComparisonChoice {
  kind: ComparisonKind;
  slot: string;
  /** `assetId@version` of the other version of the asset bound in `slot`. */
  assetRef: string;
  /** `recipeId@version` of the other version of the same recipe. */
  recipeRef: string;
  title: string;
}

export type ComparisonChoiceField = 'slot' | 'assetRef' | 'recipeRef' | 'title';

export type ComparisonChoiceErrors = Partial<Record<ComparisonChoiceField, string>>;

export const comparisonFieldIds: Readonly<Record<ComparisonChoiceField, string>> = {
  slot: 'comparacao-vinculo',
  assetRef: 'comparacao-versao-ativo',
  recipeRef: 'comparacao-versao-receita',
  title: 'comparacao-titulo',
};

export const TITLE_MAX_CHARS = 200;

export const emptyChoice: ComparisonChoice = { kind: 'asset-binding', slot: '', assetRef: '', recipeRef: '', title: '' };

export interface SelectOption {
  value: string;
  label: string;
}

/** Slots arm A pins, each with its bound ref: arm B swaps exactly one of them. */
export function bindingSlotOptions(recipe: Recipe): SelectOption[] {
  return recipe.bindings.map((binding) => ({ value: binding.slot, label: `${slotLabel(binding.slot)} · ${binding.ref}` }));
}

/** The asset id bound in `slot`, or null when the recipe does not pin that slot. */
export function boundAsset(recipe: Recipe, slot: string): { assetId: string; ref: string } | null {
  const binding = recipe.bindings.find((candidate) => candidate.slot === slot);
  if (binding === undefined || !assetRefPattern.test(binding.ref)) return null;
  return { assetId: parseAssetRef(binding.ref).assetId, ref: binding.ref };
}

/**
 * Versions arm B may run in place of `boundRef`: the same asset, another version, not deprecated
 * and not biometric (the api refuses a biometric comparison, B13), newest first.
 */
export function candidateAssetVersions(versions: readonly AssetVersionView[], boundRef: string): SelectOption[] {
  return versions
    .map((version) => ({ version, ref: formatAssetRef({ assetId: version.id, version: version.version }) }))
    .filter(({ version, ref }) => ref !== boundRef && version.status !== 'deprecated' && version.sensitivity !== 'biometric')
    .sort((left, right) => right.version.version - left.version.version)
    .map(({ version, ref }) => ({ value: ref, label: `v${version.version} · ${version.name}` }));
}

/** Other runnable versions of the recipe arm A runs. */
export function otherRecipeVersions(recipes: readonly RecipeVersionView[], selected: RecipeVersionView): SelectOption[] {
  return recipes
    .filter((view) => view.recipe.id === selected.recipe.id && view.ref !== selected.ref)
    .map((view) => ({ value: view.ref, label: `v${view.recipe.version} · ${view.recipe.name}` }));
}

export type SubjectResult =
  | { kind: 'valid'; subject: CreateComparisonRequest['subject']; title: string | undefined }
  | { kind: 'invalid'; errors: ComparisonChoiceErrors };

/** The request's `subject` and `title` from the choice; the api validates again (B14). */
export function buildSubject(choice: ComparisonChoice): SubjectResult {
  const errors: ComparisonChoiceErrors = {};
  const title = choice.title.trim();
  if (title.length > TITLE_MAX_CHARS) errors.title = `Use até ${TITLE_MAX_CHARS} caracteres.`;
  if (choice.kind === 'asset-binding') {
    if (choice.slot === '') errors.slot = 'Escolha o vínculo que muda na versão B.';
    else if (choice.assetRef === '') errors.assetRef = 'Escolha a outra versão do ativo.';
  } else if (choice.recipeRef === '') {
    errors.recipeRef = 'Escolha a outra versão da receita.';
  }
  if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };
  const subject: CreateComparisonRequest['subject'] =
    choice.kind === 'asset-binding' ? { kind: 'asset-binding', slot: choice.slot, b: choice.assetRef } : { kind: 'recipe-version', b: choice.recipeRef };
  return { kind: 'valid', subject, title: title === '' ? undefined : title };
}
