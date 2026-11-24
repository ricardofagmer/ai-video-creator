// Public, browser-safe surface of the C10 client (R1-19; reused by R1-20). Server Components import
// `serverStudioClient` / `serverTransport` from `@/lib/api/server` instead.
export { BFF_PREFIX, SESSION_EXPIRED_LOGIN_PATH, browserStudioClient, browserTransport, voiceSampleAudioUrl } from './browser';
export { createStudioClient } from './client';
export type { AssetSearchParams, PageParams, RecipeListParams, StudioClient } from './client';
export {
  ApiRequestContractError,
  ApiRequestError,
  ApiResponseContractError,
  ApiUnreachableError,
  isNotFound,
  isUnauthorized,
  parseApiErrorBody,
} from './errors';
export { checkedBody, requestJson, requestNoContent, toQueryString } from './request';
export type { ApiCall, ApiQuery, ApiRequestBody, ApiTransport, TransportRequest } from './request';
export { apiRoutes, matchApiPath, matchApiRoute } from './route-table';
export type { ApiBodyKind, ApiMethod, ApiRoute, MatchedApiRoute } from './route-table';
export type { CreateAssetUpload, FolderUploadFile, SaveAssetVersionUpload, UploadContent } from './upload';
