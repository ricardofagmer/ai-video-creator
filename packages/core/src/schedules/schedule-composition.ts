import { type TemplateDetails } from '@studio/shared/catalog';
import { COMPOSITION_CONFLICTS_MAX, recipeConflicts, runConflicts, type CompositionConflict, type RecipeCompositionFacts } from '@studio/shared/recipes';

/**
 * Guided-creation design section 3 for scheduled runs: the composition rules `RecipeCompositionCheck`
 * applies to a run draft, applied to every brief a schedule may fire. Pure, so the api gate and the
 * watcher's slot facts run the same rules without the recipe write module or a query bus. Each
 * brief contributes `runConflicts` (which includes `recipeConflicts`); with no brief, the recipe
 * alone is checked. Duplicates are dropped and the list is capped at `COMPOSITION_CONFLICTS_MAX`.
 */
export function scheduleCompositionConflicts(
  recipe: RecipeCompositionFacts,
  template: TemplateDetails | null,
  targetDurationsSec: readonly number[],
): CompositionConflict[] {
  const found = targetDurationsSec.length === 0
    ? recipeConflicts(recipe, template)
    : targetDurationsSec.flatMap((targetDurationSec) => runConflicts(recipe, template, targetDurationSec));
  const seen = new Set<string>();
  const conflicts: CompositionConflict[] = [];
  for (const conflict of found) {
    const key = JSON.stringify(conflict);
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push(conflict);
    if (conflicts.length === COMPOSITION_CONFLICTS_MAX) break;
  }
  return conflicts;
}
