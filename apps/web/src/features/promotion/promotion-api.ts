import {
  PromoteAssetVersionResponseSchema,
  PromoteRecipeVersionResponseSchema,
  PromoteVersionRequestSchema,
  apiPaths,
  type PromoteAssetVersionResponse,
  type PromoteRecipeVersionResponse,
  type PromoteVersionRequest,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 rev 3 promotion calls (SPEC 0003 section 5.4): the only way a version becomes `active`.
 * One version per call; there is no batch. `decidedBy` and `decidedAt` are not in the request:
 * the api takes them from the session and its clock.
 */
export interface PromotionApi {
  promoteAssetVersion(assetId: string, version: number, request: PromoteVersionRequest): Promise<PromoteAssetVersionResponse>;
  promoteRecipeVersion(recipeId: string, version: number, request: PromoteVersionRequest): Promise<PromoteRecipeVersionResponse>;
}

function createPromotionApi(transport: ApiTransport): PromotionApi {
  return {
    promoteAssetVersion: (assetId, version, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.assetVersionPromotion(assetId, version),
          body: { kind: 'json', value: checkedBody(PromoteVersionRequestSchema, request) },
        },
        PromoteAssetVersionResponseSchema,
      ),
    promoteRecipeVersion: (recipeId, version, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.recipeVersionPromotion(recipeId, version),
          body: { kind: 'json', value: checkedBody(PromoteVersionRequestSchema, request) },
        },
        PromoteRecipeVersionResponseSchema,
      ),
  };
}

/** The promotion client for client components (same-origin BFF). */
export const browserPromotionApi: PromotionApi = createPromotionApi(browserTransport);
