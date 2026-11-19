import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ListRecipeVersionsQuery, RUNNABLE_RECIPE_STATUSES, SaveRecipeVersionCommand, type RecipeVersionView } from '../recipes';
import { buildVariantDefinition, isReusableVariant, type VariantRecipeFacts } from './variant-recipe.builder';

/** Recipe versions scanned for a reusable variant: pages of 100, so up to 5,000 versions of one recipe. */
const MAX_VARIANT_SCAN_PAGES = 50;
const VARIANT_SCAN_PAGE_SIZE = 100;

export interface VariantRecipe {
  view: RecipeVersionView;
  reused: boolean;
}

/**
 * Arm B of an `asset-binding` comparison (B12): an existing runnable variant for the same base,
 * slot and `subject.b` is reused; otherwise the existing `SaveRecipeVersionCommand` saves version
 * N+1 as `draft`. This is the only recipe write a comparison makes, and it never changes the
 * status of any version (R2-AC-17).
 */
@Injectable()
export class VariantRecipeService {
  private readonly logger = new Logger(VariantRecipeService.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  async variantFor(facts: VariantRecipeFacts): Promise<VariantRecipe> {
    const existing = await this.findReusable(facts);
    if (existing !== null) return { view: existing, reused: true };
    const view = await this.commandBus.execute(
      new SaveRecipeVersionCommand({ recipeId: facts.base.id, definition: buildVariantDefinition(facts) }),
    );
    return { view, reused: false };
  }

  private async findReusable(facts: VariantRecipeFacts): Promise<RecipeVersionView | null> {
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < MAX_VARIANT_SCAN_PAGES; pageNumber += 1) {
      const page = await this.queryBus.execute(
        new ListRecipeVersionsQuery({
          recipeId: facts.base.id,
          statuses: [...RUNNABLE_RECIPE_STATUSES],
          limit: VARIANT_SCAN_PAGE_SIZE,
          cursor,
        }),
      );
      const match = page.items.find((item) => isReusableVariant(item.recipe, facts));
      if (match !== undefined) return match;
      if (page.nextCursor === null) return null;
      cursor = page.nextCursor;
    }
    // Past the scan bound a new variant is saved: a duplicate draft is harmless, a missed refusal is not.
    this.logger.warn({ event: 'comparisons.variant-scan-truncated', recipeId: facts.base.id, pages: MAX_VARIANT_SCAN_PAGES });
    return null;
  }
}
