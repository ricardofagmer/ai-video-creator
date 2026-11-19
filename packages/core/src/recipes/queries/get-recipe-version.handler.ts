import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { RecipeRefSchema } from '@studio/shared/recipes';
import { parseRecipeRef } from '../recipe-ref';
import { parseRecipeInput } from '../recipe-version.factory';
import { toRecipeVersionView, type RecipeVersionView } from '../recipe-version.mapper';
import { RecipeVersionRepository } from '../recipe-version.repository';
import { RecipeVersionNotFoundError } from '../recipes.errors';
import { GetRecipeVersionQuery } from './get-recipe-version.query';

@QueryHandler(GetRecipeVersionQuery)
export class GetRecipeVersionHandler implements IQueryHandler<GetRecipeVersionQuery, RecipeVersionView> {
  constructor(private readonly versions: RecipeVersionRepository) {}

  async execute(query: GetRecipeVersionQuery): Promise<RecipeVersionView> {
    const ref = parseRecipeInput(RecipeRefSchema, query.ref, 'ref');
    const { recipeId, version } = parseRecipeRef(ref);
    const row = await this.versions.findVersion(recipeId, version);
    if (row === null) throw new RecipeVersionNotFoundError(ref);
    return toRecipeVersionView(row);
  }
}
