import { type RecipeVersionView } from '@studio/shared/api';
import { type Language } from '@studio/shared/recipes';
import { type Locale } from '@studio/ui';

export const languageLabels: Readonly<Record<Language, string>> = {
  'pt-BR': 'pt-BR',
  'en-US': 'en-US',
};

/** "1920x1080 · 30 fps" (design/telas/05, Formato). */
export function formatLabel(view: RecipeVersionView): string {
  const { canvas, fps } = view.recipe.format;
  return `${canvas.width}x${canvas.height} · ${fps} fps`;
}

export function enabledStageCount(view: RecipeVersionView): number {
  return view.recipe.graph.stages.filter((stage) => stage.enabled).length;
}

/** The version a list shows per recipe: the active one, else the newest (design/telas/05). */
export function representativeRecipes(items: readonly RecipeVersionView[], locale: Locale): RecipeVersionView[] {
  const byId = new Map<string, RecipeVersionView>();
  const isActive = (view: RecipeVersionView): boolean => view.recipe.status === 'active';
  for (const item of items) {
    const current = byId.get(item.recipe.id);
    const better =
      current === undefined ||
      (isActive(item) && !isActive(current)) ||
      (isActive(item) === isActive(current) && item.recipe.version > current.recipe.version);
    if (better) byId.set(item.recipe.id, item);
  }
  return [...byId.values()].sort((left, right) => left.recipe.name.localeCompare(right.recipe.name, locale));
}
