import {
  AssetVersionPageSchema,
  AssetVersionViewSchema,
  CreateRecipeRequestSchema,
  EntryFileViewSchema,
  HealthResponseSchema,
  LoginRequestSchema,
  RecipeVersionPageSchema,
  ReferenceAnalysisViewSchema,
  RequestVoiceSampleRequestSchema,
  RecipeVersionViewSchema,
  RegisterAssetByReferenceRequestSchema,
  SaveAssetVersionByReferenceRequestSchema,
  SaveMetadataVersionRequestSchema,
  SaveRecipeVersionRequestSchema,
  SessionResponseSchema,
  SetAssetStatusResponseSchema,
  SetRecipeStatusResponseSchema,
  SetVersionStatusRequestSchema,
  VoiceSampleViewSchema,
  WatcherStatusResponseSchema,
  apiPaths,
  type AssetVersionPageView,
  type AssetVersionView,
  type CreateRecipeRequest,
  type EntryFileView,
  type HealthResponse,
  type LoginRequest,
  type RecipeVersionPageView,
  type RecipeVersionView,
  type ReferenceAnalysisView,
  type RegisterAssetByReferenceRequest,
  type RequestVoiceSampleRequest,
  type SaveAssetVersionByReferenceRequest,
  type SaveMetadataVersionRequest,
  type SaveRecipeVersionRequest,
  type SessionResponse,
  type SetAssetStatusResponse,
  type SetRecipeStatusResponse,
  type SetVersionStatusRequest,
  type VoiceSampleView,
  type WatcherStatusResponse,
} from '@studio/shared/api';
import { type AssetKind, type AssetStatus } from '@studio/shared/catalog';
import { checkedBody, requestJson, requestNoContent, type ApiTransport } from './request';
import { createAssetMultipart, saveAssetVersionMultipart, type CreateAssetUpload, type SaveAssetVersionUpload } from './upload';

/** `GET /catalog/assets` (C10 `SearchAssetsQuery`) with typed lists instead of comma text. */
export interface AssetSearchParams {
  text?: string;
  kinds?: readonly AssetKind[];
  tags?: readonly string[];
  statuses?: readonly AssetStatus[];
  sensitivity?: 'any' | 'exclude-biometric';
  /** Rev 3: `quality` orders by `qualityScore` descending, null scores last; absent means `recent`. */
  sort?: 'recent' | 'quality';
  /** Rev 3: 1..5; excludes versions with no score. */
  minQuality?: number;
  /** Rev 3: int >= 1. */
  minSampleSize?: number;
  limit?: number;
  /** Opaque `nextCursor` token (rev 3). */
  cursor?: string;
}

/** C10 `PageQuery`. */
export interface PageParams {
  limit?: number;
  cursor?: string;
}

/** `GET /recipes` (C10 `ListRecipesQuery`). */
export interface RecipeListParams extends PageParams {
  recipeId?: string;
  statuses?: readonly AssetStatus[];
}

/**
 * The typed C10 client for catalog, recipes and auth (R1-19). Every request body is checked with
 * its C10 schema before it is sent and every response is parsed with its C10 schema. Runs calls
 * (R1-20) are built on the same `requestJson` / `requestNoContent` and a transport. Rev 4
 * (API_CONTRACT_REVISION 2, R1-27) adds the two by-reference saves and the watcher state.
 */
export interface StudioClient {
  health(): Promise<HealthResponse>;
  login(request: LoginRequest): Promise<SessionResponse>;
  logout(): Promise<void>;
  session(): Promise<SessionResponse>;
  searchAssets(params?: AssetSearchParams): Promise<AssetVersionPageView>;
  listAssetVersions(assetId: string, params?: PageParams): Promise<AssetVersionPageView>;
  getAssetVersion(assetId: string, version: number): Promise<AssetVersionView>;
  /** Skills spec addendum T5: the entry file (SKILL.md) of a skill version as text. */
  readEntryFile(assetId: string, version: number): Promise<EntryFileView>;
  createAsset(upload: CreateAssetUpload): Promise<AssetVersionView>;
  saveAssetVersion(assetId: string, upload: SaveAssetVersionUpload): Promise<AssetVersionView>;
  saveMetadataVersion(assetId: string, request: SaveMetadataVersionRequest): Promise<AssetVersionView>;
  /** Rev 4: a new asset stored by reference. The web sends the path as text and never touches it. */
  registerAssetByReference(request: RegisterAssetByReferenceRequest): Promise<AssetVersionView>;
  /** Rev 4: version N+1 stored by reference. */
  saveAssetVersionByReference(assetId: string, request: SaveAssetVersionByReferenceRequest): Promise<AssetVersionView>;
  setAssetStatus(assetId: string, version: number, request: SetVersionStatusRequest): Promise<SetAssetStatusResponse>;
  listRecipes(params?: RecipeListParams): Promise<RecipeVersionPageView>;
  getRecipeVersion(recipeId: string, version: number): Promise<RecipeVersionView>;
  createRecipe(request: CreateRecipeRequest): Promise<RecipeVersionView>;
  saveRecipeVersion(recipeId: string, request: SaveRecipeVersionRequest): Promise<RecipeVersionView>;
  setRecipeStatus(recipeId: string, version: number, request: SetVersionStatusRequest): Promise<SetRecipeStatusResponse>;
  /** Rev 4: `GET /watcher`, the daemon-wide state read from its heartbeat file. */
  watcherStatus(signal?: AbortSignal): Promise<WatcherStatusResponse>;
  /**
   * Guided creation (docs/specs/2026-11-23-guided-creation-design.md section 2): asks for the
   * voice's sample in one fixed sentence. Idempotent: an open or kept sample comes back as it is.
   */
  requestVoiceSample(assetId: string, version: number, request: RequestVoiceSampleRequest, signal?: AbortSignal): Promise<VoiceSampleView>;
  getVoiceSample(assetId: string, version: number, signal?: AbortSignal): Promise<VoiceSampleView>;
  /** Section 4: asks the AI to look at a saved video reference again. */
  requestReferenceAnalysis(assetId: string, version: number, signal?: AbortSignal): Promise<ReferenceAnalysisView>;
  getReferenceAnalysis(assetId: string, version: number, signal?: AbortSignal): Promise<ReferenceAnalysisView>;
}

export function createStudioClient(transport: ApiTransport): StudioClient {
  return {
    health: () => requestJson(transport, { method: 'GET', path: apiPaths.health() }, HealthResponseSchema),
    login: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.login(), body: { kind: 'json', value: checkedBody(LoginRequestSchema, request) } },
        SessionResponseSchema,
      ),
    logout: () => requestNoContent(transport, { method: 'POST', path: apiPaths.logout() }),
    session: () => requestJson(transport, { method: 'GET', path: apiPaths.session() }, SessionResponseSchema),
    searchAssets: (params = {}) =>
      requestJson(transport, { method: 'GET', path: apiPaths.assets(), query: { ...params } }, AssetVersionPageSchema),
    listAssetVersions: (assetId, params = {}) =>
      requestJson(transport, { method: 'GET', path: apiPaths.assetVersions(assetId), query: { ...params } }, AssetVersionPageSchema),
    getAssetVersion: (assetId, version) =>
      requestJson(transport, { method: 'GET', path: apiPaths.assetVersion(assetId, version) }, AssetVersionViewSchema),
    readEntryFile: (assetId, version) =>
      requestJson(transport, { method: 'GET', path: apiPaths.assetEntryFile(assetId, version) }, EntryFileViewSchema),
    createAsset: (upload) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.assets(), body: { kind: 'multipart', value: createAssetMultipart(upload) } },
        AssetVersionViewSchema,
      ),
    saveAssetVersion: (assetId, upload) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.assetVersions(assetId), body: { kind: 'multipart', value: saveAssetVersionMultipart(upload) } },
        AssetVersionViewSchema,
      ),
    saveMetadataVersion: (assetId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.assetMetadataVersion(assetId),
          body: { kind: 'json', value: checkedBody(SaveMetadataVersionRequestSchema, request) },
        },
        AssetVersionViewSchema,
      ),
    registerAssetByReference: (request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.assetsByReference(),
          body: { kind: 'json', value: checkedBody(RegisterAssetByReferenceRequestSchema, request) },
        },
        AssetVersionViewSchema,
      ),
    saveAssetVersionByReference: (assetId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.assetVersionsByReference(assetId),
          body: { kind: 'json', value: checkedBody(SaveAssetVersionByReferenceRequestSchema, request) },
        },
        AssetVersionViewSchema,
      ),
    setAssetStatus: (assetId, version, request) =>
      requestJson(
        transport,
        {
          method: 'PUT',
          path: apiPaths.assetVersionStatus(assetId, version),
          body: { kind: 'json', value: checkedBody(SetVersionStatusRequestSchema, request) },
        },
        SetAssetStatusResponseSchema,
      ),
    listRecipes: (params = {}) =>
      requestJson(transport, { method: 'GET', path: apiPaths.recipes(), query: { ...params } }, RecipeVersionPageSchema),
    getRecipeVersion: (recipeId, version) =>
      requestJson(transport, { method: 'GET', path: apiPaths.recipeVersion(recipeId, version) }, RecipeVersionViewSchema),
    createRecipe: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.recipes(), body: { kind: 'json', value: checkedBody(CreateRecipeRequestSchema, request) } },
        RecipeVersionViewSchema,
      ),
    saveRecipeVersion: (recipeId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.recipeVersions(recipeId),
          body: { kind: 'json', value: checkedBody(SaveRecipeVersionRequestSchema, request) },
        },
        RecipeVersionViewSchema,
      ),
    setRecipeStatus: (recipeId, version, request) =>
      requestJson(
        transport,
        {
          method: 'PUT',
          path: apiPaths.recipeVersionStatus(recipeId, version),
          body: { kind: 'json', value: checkedBody(SetVersionStatusRequestSchema, request) },
        },
        SetRecipeStatusResponseSchema,
      ),
    watcherStatus: (signal) => requestJson(transport, { method: 'GET', path: apiPaths.watcher(), signal }, WatcherStatusResponseSchema),
    requestVoiceSample: (assetId, version, request, signal) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.assetVoiceSample(assetId, version),
          body: { kind: 'json', value: checkedBody(RequestVoiceSampleRequestSchema, request) },
          signal,
        },
        VoiceSampleViewSchema,
      ),
    getVoiceSample: (assetId, version, signal) =>
      requestJson(transport, { method: 'GET', path: apiPaths.assetVoiceSample(assetId, version), signal }, VoiceSampleViewSchema),
    requestReferenceAnalysis: (assetId, version, signal) =>
      requestJson(transport, { method: 'POST', path: apiPaths.assetReferenceAnalysis(assetId, version), signal }, ReferenceAnalysisViewSchema),
    getReferenceAnalysis: (assetId, version, signal) =>
      requestJson(transport, { method: 'GET', path: apiPaths.assetReferenceAnalysis(assetId, version), signal }, ReferenceAnalysisViewSchema),
  };
}
