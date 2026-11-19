import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetVersionActivationsQuery } from '@studio/core/promotion';
import { type RecipeVersionView as CoreRecipeVersionView } from '@studio/core/recipes';
import { type RecipeVersionView } from '@studio/shared/api';

/**
 * Adds the rev 3 `activation` (SPEC 0003 section 4.3, B15) to the recipe versions core returns:
 * the recorded owner approval that made a version `active`, or null. One lookup per call; recipe
 * pages hold at most 100 versions, the bound of the lookup.
 */
@Injectable()
export class RecipeVersionViewAssembler {
  constructor(private readonly queryBus: QueryBus) {}

  async one(version: CoreRecipeVersionView): Promise<RecipeVersionView> {
    const [activation] = await this.queryBus.execute(new GetVersionActivationsQuery('recipe-version', [version.ref]));
    return { ...version, activation: activation?.activation ?? null };
  }

  async many(versions: readonly CoreRecipeVersionView[]): Promise<RecipeVersionView[]> {
    if (versions.length === 0) return [];
    const refs = [...new Set(versions.map((version) => version.ref))];
    const activations = await this.queryBus.execute(new GetVersionActivationsQuery('recipe-version', refs));
    const byRef = new Map(activations.map((entry) => [entry.ref, entry.activation]));
    return versions.map((version) => ({ ...version, activation: byRef.get(version.ref) ?? null }));
  }
}
