import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type TemplateDetails } from '@studio/shared/catalog';
import { recipeConflicts, runConflicts, type Recipe } from '@studio/shared/recipes';
import { GetAssetVersionQuery } from '../catalog';
import { CompositionConflictError } from './recipes.errors';

/**
 * Guided-creation design section 3, on the server: the same pure rules the web screens run, so the
 * browser and core always agree. Runs after `RecipeBindingVerifier`, so the template pin is known
 * to exist with its hash. A template that cannot be read leaves only the binding rules, exactly as
 * the shared module defines for a null template.
 */
@Injectable()
export class RecipeCompositionCheck {
  private readonly logger = new Logger(RecipeCompositionCheck.name);

  constructor(private readonly queryBus: QueryBus) {}

  /** `CreateRecipe` and `SaveRecipeVersion`: the recipe on its own. */
  async assertRecipe(recipe: Recipe): Promise<void> {
    const conflicts = recipeConflicts(recipe, await this.templateOf(recipe));
    if (conflicts.length > 0) throw new CompositionConflictError(conflicts);
  }

  /** The run draft: the recipe's rules plus the brief's target duration against the template. */
  async assertRun(recipe: Recipe, targetDurationSec: number): Promise<void> {
    const conflicts = runConflicts(recipe, await this.templateOf(recipe), targetDurationSec);
    if (conflicts.length > 0) throw new CompositionConflictError(conflicts);
  }

  /** Details of the version bound to the `template` slot; null when unbound, not a template, or unreadable. */
  private async templateOf(recipe: Recipe): Promise<TemplateDetails | null> {
    const binding = recipe.bindings.find((candidate) => candidate.slot === 'template');
    if (binding === undefined) return null;
    try {
      const version = await this.queryBus.execute(new GetAssetVersionQuery(binding.ref));
      return version.kind === 'template' ? version.details : null;
    } catch (error) {
      this.logger.warn({ event: 'recipe.template-unreadable', ref: binding.ref, errorName: error instanceof Error ? error.name : 'unknown' });
      return null;
    }
  }
}
