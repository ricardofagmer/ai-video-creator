import { Injectable } from '@nestjs/common';
import { type AssetRef } from '@studio/shared/catalog';
import { missingBriefInputs, type Brief, type RecipeRef } from '@studio/shared/recipes';
import { RUNNABLE_RECIPE_STATUSES } from '../recipes/recipe-policy';
import { type RecipeVersionView } from '../recipes/recipe-version.mapper';
import { ScheduleRecipeReader } from './schedule-recipe.reader';
import { ScheduleRecipeNotRunnableError } from './schedules.errors';

/** What the gate needs of each brief: its body and its references. */
export interface GatedBrief {
  brief: Brief;
  references: readonly AssetRef[];
}

/**
 * SPEC 0006 section 5.5 step 3, for the api and CLI writes: the pinned version resolves, its status
 * is runnable, its bindings verify, and every brief has the recipe's required inputs and resolvable
 * references: the checks of `RunDraftService.create`, applied to every brief at once.
 */
@Injectable()
export class ScheduleRecipeGate {
  constructor(private readonly recipes: ScheduleRecipeReader) {}

  async runnableVersion(ref: RecipeRef, briefs: readonly GatedBrief[]): Promise<RecipeVersionView> {
    const version = await this.recipes.findVersion(ref);
    if (version === null) throw new ScheduleRecipeNotRunnableError(ref, 'recipe-not-found');
    const { recipe } = version;
    if (!RUNNABLE_RECIPE_STATUSES.includes(recipe.status)) throw new ScheduleRecipeNotRunnableError(ref, 'recipe-not-runnable');
    if (briefs.some((brief) => missingBriefInputs(brief.brief, recipe.inputs).length > 0)) {
      throw new ScheduleRecipeNotRunnableError(ref, 'brief-inputs-missing');
    }
    const unresolved = await this.recipes.unresolved({ bindings: recipe.bindings, references: briefs.flatMap((brief) => brief.references) });
    if (unresolved.bindings.length > 0) throw new ScheduleRecipeNotRunnableError(ref, 'bindings-unresolvable');
    if (unresolved.references.length > 0) throw new ScheduleRecipeNotRunnableError(ref, 'references-unresolvable');
    return version;
  }
}
