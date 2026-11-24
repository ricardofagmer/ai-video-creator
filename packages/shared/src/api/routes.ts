/**
 * C10 routes. The api's controllers use `apiRouteSegments` in their decorators and the web builds
 * URLs with `apiPaths`, so both read the same strings. Paths are relative to the api origin
 * (`http://127.0.0.1:4311` by default, A9). Every route except `health`, `auth/login` and the
 * installer's `install/*` routes needs the session cookie and answers 401 without it (criterion 27,
 * amended by ADR 0010: `install/presence` and `install/pair` are public, `install/status` needs a
 * portal token instead of the session). Rows marked "rev 4" were added by
 * SPEC 0002 rev 4 (section 13.2, `API_CONTRACT_REVISION = 2`); neither by-reference route clashes
 * with a rev 3 route (`versions/by-reference` sits beside `versions/from-previous`). Rows marked
 * "R2" are contract revision 3 (SPEC 0003 section 4.3, `API_CONTRACT_REVISION = 3`); "R2 breaking"
 * marks the one behaviour change: both `PUT .../status` routes answer 422
 * `promotion-approval-required` to `status: 'active'`. `/catalog/search` is its own controller
 * base, so it does not clash with `/catalog/assets`.
 *
 * | Method | Path | Body / query | Success |
 * |---|---|---|---|
 * | GET | /health | - | 200 HealthResponse (public) |
 * | POST | /auth/login | LoginRequest | 200 SessionResponse + Set-Cookie (public) |
 * | POST | /auth/logout | - | 204, cookie cleared |
 * | GET | /auth/session | - | 200 SessionResponse |
 * | GET | /catalog/assets | SearchAssetsQuery (R2: + sort, minQuality, minSampleSize) | 200 AssetVersionPageView |
 * | POST | /catalog/assets | multipart, CreateAssetUploadFields | 201 AssetVersionView |
 * | POST | /catalog/assets/by-reference | RegisterAssetByReferenceRequest (JSON) | 201 AssetVersionView (rev 4) |
 * | GET | /catalog/assets/:assetId/versions | PageQuery | 200 AssetVersionPageView |
 * | POST | /catalog/assets/:assetId/versions | multipart, SaveAssetVersionUploadFields | 201 AssetVersionView |
 * | POST | /catalog/assets/:assetId/versions/from-previous | SaveMetadataVersionRequest | 201 AssetVersionView |
 * | POST | /catalog/assets/:assetId/versions/by-reference | SaveAssetVersionByReferenceRequest (JSON) | 201 AssetVersionView (rev 4) |
 * | GET | /catalog/assets/:assetId/versions/:version | - | 200 AssetVersionView |
 * | PUT | /catalog/assets/:assetId/versions/:version/status | SetVersionStatusRequest | 200 SetAssetStatusResponse (R2 breaking) |
 * | POST | /catalog/assets/:assetId/versions/:version/promotion | PromoteVersionRequest | 201 PromoteAssetVersionResponse (R2) |
 * | PUT | /catalog/assets/:assetId/versions/:version/learnings/:noteId/status | RetireLearningRequest | 200 LearningNoteView (R2) |
 * | POST | /catalog/search | SemanticSearchRequest | 200 SemanticSearchResponse (R2) |
 * | GET | /catalog/search/status | - | 200 SearchIndexStatusResponse (R2) |
 * | GET | /catalog/assets/:assetId/versions/:version/image | - | 200 stored PNG/JPEG/WebP bytes (images upload) |
 * | POST | /catalog/assets/:assetId/versions/:version/voice-sample | RequestVoiceSampleRequest | 202 VoiceSampleView (guided creation) |
 * | GET | /catalog/assets/:assetId/versions/:version/voice-sample | - | 200 VoiceSampleView (guided creation) |
 * | GET | /catalog/assets/:assetId/versions/:version/voice-sample/audio | - | 200 audio bytes, `no-store` (guided creation) |
 * | POST | /catalog/assets/:assetId/versions/:version/reference-analysis | - | 202 ReferenceAnalysisView (guided creation) |
 * | GET | /catalog/assets/:assetId/versions/:version/reference-analysis | - | 200 ReferenceAnalysisView (guided creation) |
 * | GET | /recipes | ListRecipesQuery | 200 RecipeVersionPageView |
 * | POST | /recipes | CreateRecipeRequest | 201 RecipeVersionView |
 * | POST | /recipes/:recipeId/versions | SaveRecipeVersionRequest | 201 RecipeVersionView |
 * | GET | /recipes/:recipeId/versions/:version | - | 200 RecipeVersionView |
 * | PUT | /recipes/:recipeId/versions/:version/status | SetVersionStatusRequest | 200 SetRecipeStatusResponse (R2 breaking) |
 * | POST | /recipes/:recipeId/versions/:version/promotion | PromoteVersionRequest | 201 PromoteRecipeVersionResponse (R2) |
 * | GET | /runs | ListRunsQuery | 200 RunIndexPageView |
 * | POST | /runs | CreateRunRequest | 201 RunDraftResponse |
 * | GET | /runs/:runId | - | 200 RunStateResponse |
 * | POST | /runs/:runId/start | - | 200 RunDraftResponse |
 * | GET | /runs/:runId/events | RunEventsQuery | 200 RunEventsResponse |
 * | GET | /runs/:runId/artifact | RunArtifactQuery, optional Range | 200/206 bytes |
 * | POST | /runs/:runId/control | RunControlRequest | 202 RunControlResponse |
 * | POST | /runs/:runId/gate-decisions | GateDecisionRequest | 201 GateDecisionResponse |
 * | POST | /runs/:runId/review | ReviewDecisionRequest | 201 ReviewDecisionResponse |
 * | POST | /runs/:runId/promote | PromoteFromRunRequest | 201 PromoteFromRunResponse |
 * | POST | /runs/:runId/learnings | SaveLearningRequest | 201 LearningNoteView (R2) |
 * | GET | /watcher | - | 200 WatcherStatusResponse (rev 4) |
 * | GET | /comparisons | ListComparisonsQuery | 200 ComparisonPageView (R2) |
 * | POST | /comparisons | CreateComparisonRequest | 201 ComparisonView, two `draft` runs (R2) |
 * | GET | /comparisons/:comparisonId | - | 200 ComparisonView (R2) |
 * | POST | /comparisons/:comparisonId/start | StartComparisonRequest | 200 ComparisonView, both runs `pending` (R2) |
 * | GET | /curations | ListCurationsQuery | 200 CurationPageView, newest first (C5) |
 * | POST | /curations | CreateCurationRequest | 201 CurationView, status `requested` (C5) |
 * | GET | /curations/:curationId | - | 200 CurationView (C5) |
 * | POST | /curations/:curationId/decision | CurationDecisionRequest | 200 CurationView (C5) |
 * | GET | /runs/:runId/publications | - | 200 RunPublicationsView (R3) |
 * | POST | /runs/:runId/publications | CreatePublicationRequest | 201 PublicationView (R3) |
 * | DELETE | /runs/:runId/publications/:publicationId | - | 200 RemovePublicationResponse, 409 with snapshots (R3) |
 * | PUT | /runs/:runId/publications/:publicationId/metrics/:asOfDate | SaveMetricSnapshotRequest | 200 MetricSnapshotView, source `form` (R3) |
 * | POST | /metrics/imports | multipart MetricImportFields + `file`; MetricImportQuery | 200 MetricImportReport (R3) |
 * | GET | /metrics/imports | ListMetricImportsQuery | 200 MetricImportPageView (R3) |
 * | GET | /schedules | - | 200 ScheduleListView, never `deleted` (R3) |
 * | POST | /schedules | CreateScheduleRequest | 201 ScheduleView (R3) |
 * | GET | /schedules/:scheduleId | - | 200 ScheduleView (R3) |
 * | PATCH | /schedules/:scheduleId | PatchScheduleRequest | 200 ScheduleView (R3) |
 * | GET | /insights | - | 200 InsightsView, read-only (R4, rev 6) |
 * | GET | /platforms | - | 200 PlatformsView, three PlatformView (R4, rev 7) |
 * | PATCH | /platforms/:platform/gate | GateChangeRequest | 200 PlatformView (R4, rev 7) |
 * | POST | /platforms/:platform/connection | - | 201 ConnectionStartView (R4, rev 7) |
 * | GET | /platforms/:platform/connection/callback | ConnectionCallbackQuery | 303 to `/contas?resultado=...` (R4, rev 7; browser only, not in the BFF table) |
 * | DELETE | /platforms/:platform/connection | - | 200 PlatformView (R4, rev 7) |
 * | GET | /runs/:runId/publish | - | 200 RunPublishView (R4, rev 7) |
 * | POST | /runs/:runId/publish/:platform | PublishRequest | 202 PublishAttemptView; 200 when `idempotencyKey` repeats (R4, rev 7) |
 * | DELETE | /runs/:runId/publish/attempts/:attemptId | - | 200 PublishAttemptView `cancelled`; 409 once claimed (R4, rev 7) |
 * | GET | /install/presence | - | 200 InstallPresence, 503 with no body on an unsupported platform (public; desktop installer C1 rev 2) |
 * | POST | /install/pair | InstallPairRequest | 200 InstallPairing, 401 with no body (public; C1 rev 2) |
 * | GET | /install/status | `Authorization: Bearer` portal token | 200 InstallStatus, 401 or 503 with no body (C1 rev 2) |
 *
 * Errors use `ApiError`: 400 request shape, 401 no session or wrong passphrase, 403 refused Host
 * or Origin, 404 unknown id, 409 state conflict (e.g. a live watcher owns the run), 413 upload too
 * large, 416 artifact byte range outside the file, 422 domain validation, 429 login rate limit,
 * 503 dependency (e.g. no passphrase set).
 * State-changing requests from a browser must carry an allowlisted `Origin` (the web's origin).
 * The api uploads nothing: a publish route only records the owner's request, and the watcher
 * uploads between runs (SPEC 0007 L2). Every R2 row needs the session (none is public) and every
 * non-GET R2 row the allowlisted `Origin`; `decidedBy`, `createdBy`, timestamps and
 * `correlationId` come from the session, the server clock and `x-request-id`, never from a body.
 * R2 adds 409 and 422 reasons and 503 `embedding-unavailable` and `month-spend-unavailable`
 * (`apiRev3ErrorReasons`). No response carries an `embedding` vector. Rows marked "C5" are
 * contract revision 4 (SPEC 0005 section 4.4, `API_CONTRACT_REVISION = 4`), all additive; their
 * refusal reasons are `apiRev4ErrorReasons`, `decidedBy` and `correlationId` come from the session
 * and `x-request-id`, and no curation route sets a version status. Rows marked "R3" are contract
 * revision 5 (SPEC 0006 section 4.4, `API_CONTRACT_REVISION = 5`), all additive; their refusal
 * reasons are `apiRev5ErrorReasons`. `recordedBy`, `importedBy`, `createdBy` and `correlationId`
 * come from the session and `x-request-id`. No R3 route fetches a URL, publishes, sets a run
 * status, or writes a schedule's `cursor.json` or `slots.jsonl`. Rows marked "rev 7" are contract
 * revision 7 (SPEC 0007 section 4.4, `API_CONTRACT_REVISION = 7`), all additive; their refusal
 * reasons are `apiRev7ErrorReasons`. `:platform` is checked with `PlatformSchema` and `:attemptId`
 * with `PublishAttemptIdSchema`. The callback is reached by the browser directly from the platform,
 * keeps the session guard (L6) and is the only rev 7 row absent from the web's BFF route table. The
 * api calls a platform only in connect (code exchange, one identity call) and disconnect (one
 * best-effort revoke); no rev 7 route sends video bytes.
 */
export const apiRouteSegments = {
  health: 'health',
  auth: 'auth',
  login: 'login',
  logout: 'logout',
  session: 'session',
  catalogAssets: 'catalog/assets',
  recipes: 'recipes',
  runs: 'runs',
  /** Rev 4: `GET /watcher`. */
  watcher: 'watcher',
  /** Rev 4: last segment of the two by-reference catalog routes. */
  byReference: 'by-reference',
  /** Skills spec addendum T5: last segment of `GET /catalog/assets/:id/versions/:version/entry-file`. */
  entryFile: 'entry-file',
  /** Images upload (2026-11-24): last segment of `GET /catalog/assets/:id/versions/:version/image`. */
  image: 'image',
  /** Guided-creation spec: segment of the voice sample routes, after `versions/:version`. */
  voiceSample: 'voice-sample',
  /** Guided-creation spec: last segment of `GET .../voice-sample/audio`. */
  voiceSampleAudio: 'audio',
  /** Guided-creation spec: segment of the reference analysis routes, after `versions/:version`. */
  referenceAnalysis: 'reference-analysis',
  /** R2: controller base of `POST /catalog/search` and `GET /catalog/search/status`. */
  catalogSearch: 'catalog/search',
  /** R2: last segment of `GET /catalog/search/status`. */
  searchIndexStatus: 'status',
  /** R2: last segment of the asset and recipe promotion routes. */
  promotion: 'promotion',
  /** R2: segment of `POST /runs/:runId/learnings` and of the learning retire route. */
  learnings: 'learnings',
  /** R2: controller base of the comparison routes. */
  comparisons: 'comparisons',
  /** C5 (rev 4): controller base of the curation routes. */
  curations: 'curations',
  /** C5 (rev 4): last segment of `POST /curations/:curationId/decision`. */
  curationDecision: 'decision',
  /** R3 (rev 5): segment of the run publication routes, after `runs/:runId`. */
  publications: 'publications',
  /** R3 (rev 5): segment of the form metrics route, after `publications/:publicationId`. */
  metrics: 'metrics',
  /** R3 (rev 5): controller base of `POST` and `GET /metrics/imports`. */
  metricImports: 'metrics/imports',
  /** R3 (rev 5): controller base of the schedule routes. */
  schedules: 'schedules',
  /** R4 (rev 6): controller base of `GET /insights`. */
  insights: 'insights',
  /** R4 (rev 7): controller base of the platform routes. */
  platforms: 'platforms',
  /** R4 (rev 7): last segment of `PATCH /platforms/:platform/gate`. */
  platformGate: 'gate',
  /** R4 (rev 7): segment of the connection routes, after `platforms/:platform`. */
  platformConnection: 'connection',
  /** R4 (rev 7): last segment of `GET /platforms/:platform/connection/callback`. */
  platformConnectionCallback: 'callback',
  /** R4 (rev 7): segment of the publish routes, after `runs/:runId`. */
  publish: 'publish',
  /** R4 (rev 7): segment of the cancel route, after `runs/:runId/publish`. */
  publishAttempts: 'attempts',
  /** Desktop installer C1 rev 1: controller base of the three `/install/*` routes (portal only). */
  install: 'install',
  /** C1 rev 1: last segment of `GET /install/presence` (public). */
  installPresence: 'presence',
  /** C1 rev 1: last segment of `POST /install/pair` (one-time code). */
  installPair: 'pair',
  /** C1 rev 1: last segment of `GET /install/status` (portal bearer token). */
  installStatus: 'status',
};

export const apiPaths = {
  health: (): string => '/health',
  login: (): string => '/auth/login',
  logout: (): string => '/auth/logout',
  session: (): string => '/auth/session',
  assets: (): string => '/catalog/assets',
  assetsByReference: (): string => '/catalog/assets/by-reference',
  assetVersions: (assetId: string): string => `/catalog/assets/${encodeURIComponent(assetId)}/versions`,
  assetMetadataVersion: (assetId: string): string => `/catalog/assets/${encodeURIComponent(assetId)}/versions/from-previous`,
  assetVersionsByReference: (assetId: string): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/by-reference`,
  assetVersion: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}`,
  assetEntryFile: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/entry-file`,
  assetImage: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/image`,
  assetVoiceSample: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/voice-sample`,
  assetVoiceSampleAudio: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/voice-sample/audio`,
  assetReferenceAnalysis: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/reference-analysis`,
  assetVersionStatus: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/status`,
  assetVersionPromotion: (assetId: string, version: number): string =>
    `/catalog/assets/${encodeURIComponent(assetId)}/versions/${version}/promotion`,
  assetLearningStatus: (options: { assetId: string; version: number; noteId: string }): string =>
    `/catalog/assets/${encodeURIComponent(options.assetId)}/versions/${options.version}/learnings/${encodeURIComponent(options.noteId)}/status`,
  catalogSearch: (): string => '/catalog/search',
  catalogSearchStatus: (): string => '/catalog/search/status',
  recipes: (): string => '/recipes',
  recipeVersions: (recipeId: string): string => `/recipes/${encodeURIComponent(recipeId)}/versions`,
  recipeVersion: (recipeId: string, version: number): string => `/recipes/${encodeURIComponent(recipeId)}/versions/${version}`,
  recipeVersionStatus: (recipeId: string, version: number): string =>
    `/recipes/${encodeURIComponent(recipeId)}/versions/${version}/status`,
  recipeVersionPromotion: (recipeId: string, version: number): string =>
    `/recipes/${encodeURIComponent(recipeId)}/versions/${version}/promotion`,
  runs: (): string => '/runs',
  run: (runId: string): string => `/runs/${encodeURIComponent(runId)}`,
  runStart: (runId: string): string => `/runs/${encodeURIComponent(runId)}/start`,
  runEvents: (runId: string): string => `/runs/${encodeURIComponent(runId)}/events`,
  runArtifact: (runId: string, relativePath: string): string =>
    `/runs/${encodeURIComponent(runId)}/artifact?path=${encodeURIComponent(relativePath)}`,
  runControl: (runId: string): string => `/runs/${encodeURIComponent(runId)}/control`,
  runGateDecisions: (runId: string): string => `/runs/${encodeURIComponent(runId)}/gate-decisions`,
  runReview: (runId: string): string => `/runs/${encodeURIComponent(runId)}/review`,
  runPromote: (runId: string): string => `/runs/${encodeURIComponent(runId)}/promote`,
  runLearnings: (runId: string): string => `/runs/${encodeURIComponent(runId)}/learnings`,
  watcher: (): string => '/watcher',
  comparisons: (): string => '/comparisons',
  comparison: (comparisonId: string): string => `/comparisons/${encodeURIComponent(comparisonId)}`,
  comparisonStart: (comparisonId: string): string => `/comparisons/${encodeURIComponent(comparisonId)}/start`,
  curations: (): string => '/curations',
  curation: (curationId: string): string => `/curations/${encodeURIComponent(curationId)}`,
  curationDecision: (curationId: string): string => `/curations/${encodeURIComponent(curationId)}/decision`,
  runPublications: (runId: string): string => `/runs/${encodeURIComponent(runId)}/publications`,
  runPublication: (runId: string, publicationId: string): string =>
    `/runs/${encodeURIComponent(runId)}/publications/${encodeURIComponent(publicationId)}`,
  runPublicationMetrics: (options: { runId: string; publicationId: string; asOfDate: string }): string =>
    `/runs/${encodeURIComponent(options.runId)}/publications/${encodeURIComponent(options.publicationId)}/metrics/${encodeURIComponent(options.asOfDate)}`,
  metricImports: (options?: { dryRun: boolean }): string =>
    options === undefined ? '/metrics/imports' : `/metrics/imports?dryRun=${options.dryRun ? 'true' : 'false'}`,
  schedules: (): string => '/schedules',
  schedule: (scheduleId: string): string => `/schedules/${encodeURIComponent(scheduleId)}`,
  insights: (): string => '/insights',
  platforms: (): string => '/platforms',
  platformGate: (platform: string): string => `/platforms/${encodeURIComponent(platform)}/gate`,
  platformConnection: (platform: string): string => `/platforms/${encodeURIComponent(platform)}/connection`,
  platformConnectionCallback: (platform: string): string => `/platforms/${encodeURIComponent(platform)}/connection/callback`,
  runPublish: (runId: string): string => `/runs/${encodeURIComponent(runId)}/publish`,
  runPublishPlatform: (runId: string, platform: string): string =>
    `/runs/${encodeURIComponent(runId)}/publish/${encodeURIComponent(platform)}`,
  runPublishAttempt: (runId: string, attemptId: string): string =>
    `/runs/${encodeURIComponent(runId)}/publish/attempts/${encodeURIComponent(attemptId)}`,
  installPresence: (): string => '/install/presence',
  installPair: (): string => '/install/pair',
  installStatus: (): string => '/install/status',
};
