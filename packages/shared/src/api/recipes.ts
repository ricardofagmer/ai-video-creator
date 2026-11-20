import { z } from 'zod';
import { Sha256Schema } from '../common/ids';
import { AssetStatusSchema } from '../catalog/asset-kind';
import { RecipeBaseSchema, RecipeIdSchema, RecipeRefSchema, RecipeSchema } from '../recipes/recipe';
import { PageLimitQuerySchema, pageOf, queryInteger, queryList } from './common';
import { PromotionApprovalViewSchema } from './promotion';

/**
 * A saved recipe version with its pin (C2). Rev 3 (SPEC 0003 section 4.3): `activation`, the
 * recorded owner approval that made it `active`, or null (B15).
 */
export const RecipeVersionViewSchema = z
  .object({
    ref: RecipeRefSchema,
    contentHash: Sha256Schema,
    recipe: RecipeSchema,
    activation: PromotionApprovalViewSchema.nullable(),
  })
  .strict();
export type RecipeVersionView = z.infer<typeof RecipeVersionViewSchema>;

export const RecipeVersionPageSchema = pageOf(RecipeVersionViewSchema);
export type RecipeVersionPageView = z.infer<typeof RecipeVersionPageSchema>;

/**
 * `PUT /recipes/:recipeId/versions/:version/status` response. Rev 3: the route only deprecates
 * (`active` answers 422 `promotion-approval-required`); `replaced` is kept for the rev 2 shape and
 * is null.
 */
export const SetRecipeStatusResponseSchema = z
  .object({
    version: RecipeVersionViewSchema,
    replaced: RecipeVersionViewSchema.nullable(),
  })
  .strict();
export type SetRecipeStatusResponse = z.infer<typeof SetRecipeStatusResponseSchema>;

/** `POST /recipes/:recipeId/versions/:version/promotion` (201, rev 3): same shape as the asset response. */
export const PromoteRecipeVersionResponseSchema = z
  .object({
    version: RecipeVersionViewSchema,
    replaced: RecipeVersionViewSchema.nullable(),
    approval: PromotionApprovalViewSchema,
  })
  .strict();
export type PromoteRecipeVersionResponse = z.infer<typeof PromoteRecipeVersionResponseSchema>;

/** `GET /recipes` query. */
export const ListRecipesQuerySchema = z
  .object({
    recipeId: RecipeIdSchema.optional(),
    statuses: queryList(AssetStatusSchema, AssetStatusSchema.options.length).optional(),
    limit: PageLimitQuerySchema.optional(),
    cursor: z.string().regex(/^[1-9][0-9]{0,14}$/).optional(),
  })
  .strict();
export type ListRecipesQuery = z.input<typeof ListRecipesQuerySchema>;

export const RecipeParamsSchema = z.object({ recipeId: RecipeIdSchema }).strict();
export const RecipeVersionParamsSchema = z
  .object({ recipeId: RecipeIdSchema, version: queryInteger(1, 1_000_000) })
  .strict();

/**
 * A recipe definition as sent by the web: every C2 field except `id`, `version`, `status` and
 * the timestamps, which the studio sets. Field shapes are checked here; the cross-field rules of
 * C2 (stage order, defined checks, unique ids, canvas ratio) and the binding pins are checked by
 * the recipes module.
 */
export const RecipeDefinitionInputSchema = RecipeBaseSchema.omit({
  id: true,
  version: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type RecipeDefinitionInput = z.infer<typeof RecipeDefinitionInputSchema>;

/** `POST /recipes`: a new recipe and its version 1 as `draft`. */
export const CreateRecipeRequestSchema = z
  .object({
    recipeId: RecipeIdSchema,
    definition: RecipeDefinitionInputSchema,
  })
  .strict();
export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequestSchema>;

/** `POST /recipes/:recipeId/versions`: version N+1 as `draft`; nothing is inherited. */
export const SaveRecipeVersionRequestSchema = z.object({ definition: RecipeDefinitionInputSchema }).strict();
export type SaveRecipeVersionRequest = z.infer<typeof SaveRecipeVersionRequestSchema>;
