import { Query } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetStatusSchema } from '@studio/shared/catalog';
import { RecipeIdSchema } from '@studio/shared/recipes';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../catalog';
import { type RecipeVersionView } from '../recipe-version.mapper';

/** Opaque to callers: the last row id of the previous page, as returned in `nextCursor`. */
const RecipePageCursorSchema = z.string().regex(/^[1-9][0-9]{0,14}$/, 'cursor comes from nextCursor only');

/** rules/backend.md pagination (default 20, max 100), the same bounds as the catalog lists. */
export const ListRecipeVersionsCriteriaSchema = z
  .object({
    /** Versions of one recipe; omitted lists every recipe's versions. */
    recipeId: RecipeIdSchema.optional(),
    statuses: z.array(AssetStatusSchema).min(1).max(AssetStatusSchema.options.length).optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    cursor: RecipePageCursorSchema.optional(),
  })
  .strict();
export type ListRecipeVersionsCriteria = z.input<typeof ListRecipeVersionsCriteriaSchema>;

export interface RecipeVersionPage {
  items: RecipeVersionView[];
  /** Matching versions in total, independent of the cursor. */
  total: number;
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
}

export class ListRecipeVersionsQuery extends Query<RecipeVersionPage> {
  /** Validated by the handler. */
  constructor(readonly criteria: ListRecipeVersionsCriteria) {
    super();
  }
}
