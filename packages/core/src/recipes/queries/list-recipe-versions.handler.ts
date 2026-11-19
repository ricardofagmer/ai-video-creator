import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { parseRecipeInput } from '../recipe-version.factory';
import { toRecipeVersionView } from '../recipe-version.mapper';
import { RecipeVersionRepository } from '../recipe-version.repository';
import { ListRecipeVersionsCriteriaSchema, ListRecipeVersionsQuery, type RecipeVersionPage } from './list-recipe-versions.query';

@QueryHandler(ListRecipeVersionsQuery)
export class ListRecipeVersionsHandler implements IQueryHandler<ListRecipeVersionsQuery, RecipeVersionPage> {
  constructor(private readonly versions: RecipeVersionRepository) {}

  async execute(query: ListRecipeVersionsQuery): Promise<RecipeVersionPage> {
    const criteria = parseRecipeInput(ListRecipeVersionsCriteriaSchema, query.criteria, 'criteria');
    const page = await this.versions.listVersions(
      { recipeId: criteria.recipeId ?? null, statuses: criteria.statuses ?? null },
      { afterRowId: criteria.cursor === undefined ? null : Number.parseInt(criteria.cursor, 10), limit: criteria.limit },
    );
    const last = page.rows.at(-1);
    return {
      items: page.rows.map(toRecipeVersionView),
      total: page.total,
      nextCursor: page.hasMore && last !== undefined ? String(last.id) : null,
    };
  }
}
