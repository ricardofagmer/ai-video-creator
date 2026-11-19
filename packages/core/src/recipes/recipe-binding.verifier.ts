import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type AssetVersion } from '@studio/shared/catalog';
import { type Recipe } from '@studio/shared/recipes';
import { AssetVersionNotFoundError, GetAssetVersionQuery } from '../catalog';
import { RecipeBindingInvalidError, type BindingProblem } from './recipes.errors';

/**
 * PRD 5.4 rule 4: a binding pins `assetId@version` plus `contentHash`. Checks each pin against
 * the catalog row through the catalog's query (no re-hash; `preflight` re-hashes the bytes).
 * Catalog versions are immutable, so a pin that holds at save time keeps holding.
 */
@Injectable()
export class RecipeBindingVerifier {
  constructor(private readonly queryBus: QueryBus) {}

  async verify(recipe: Recipe): Promise<void> {
    const problems: BindingProblem[] = [];
    // One query at a time: at most 64 bindings, each a primary-key read.
    for (const binding of recipe.bindings) {
      const version = await this.findVersion(binding.ref);
      if (version === null) problems.push({ slot: binding.slot, ref: binding.ref, problem: 'unknown-asset-version' });
      else if (version.contentHash !== binding.contentHash) problems.push({ slot: binding.slot, ref: binding.ref, problem: 'hash-differs' });
    }
    if (problems.length > 0) throw new RecipeBindingInvalidError(problems);
  }

  private async findVersion(ref: string): Promise<AssetVersion | null> {
    try {
      return await this.queryBus.execute(new GetAssetVersionQuery(ref));
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return null;
      throw error;
    }
  }
}
