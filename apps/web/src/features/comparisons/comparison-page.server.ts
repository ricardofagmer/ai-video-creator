import 'server-only';
import { type VideoAspect } from '@studio/ui';
import { type ComparisonArmView, type ComparisonView } from '@studio/shared/api';
import { ApiRequestError, ApiResponseContractError, isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { finishedRunStatuses, recipeIdOf } from './comparison-labels';
import { serverComparisonsApi } from './comparisons-api.server';

/** `GET /comparisons/:id`, or null when the id is unknown. */
export async function loadComparison(comparisonId: string): Promise<ComparisonView | null> {
  try {
    return await serverComparisonsApi().getComparison(comparisonId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The player frame of one arm, from the format of the recipe version it ran. VideoPlayer takes
 * 16:9 and 9:16; a 1:1 recipe, or one that cannot be read, uses the landscape frame.
 */
async function armAspect(arm: ComparisonArmView): Promise<VideoAspect> {
  const parsed = recipeIdOf(arm.recipe.ref);
  // No read while the arm has no video yet: the page refreshes every second while it runs.
  if (parsed === null || !finishedRunStatuses.includes(arm.status)) return '16:9';
  try {
    const view = await serverStudioClient().getRecipeVersion(parsed.recipeId, parsed.version);
    return view.recipe.format.aspect === '9:16' ? '9:16' : '16:9';
  } catch (error) {
    if (error instanceof ApiRequestError || error instanceof ApiResponseContractError) return '16:9';
    throw error;
  }
}

export async function loadArmAspects(comparison: ComparisonView): Promise<Readonly<Record<ComparisonArmView['arm'], VideoAspect>>> {
  const [a, b] = await Promise.all([armAspect(comparison.arms.a), armAspect(comparison.arms.b)]);
  return { a, b };
}
