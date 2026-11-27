import { AssetIdSchema, ComparisonIdSchema, CurationIdSchema, LearningNoteIdSchema } from '@studio/shared/catalog';
import { IsoDateSchema, PublicationIdSchema, metricsBounds } from '@studio/shared/metrics';
import { PlatformSchema, PublishAttemptIdSchema } from '@studio/shared/platforms';
import { RecipeIdSchema } from '@studio/shared/recipes';
import { RunIdSchema } from '@studio/shared/run-format';
import { ScheduleIdSchema } from '@studio/shared/schedules';

/**
 * The C10 route table (`packages/shared/src/api/routes.ts`, rev 7) as an
 * allowlist. The BFF and the server-side helper forward a request only when its method and path
 * match one row here, with every parameter segment checked against its C1/C2/C3 id schema; the
 * forwarded path is rebuilt from the validated segments, so `..`, encoded slashes and any other
 * path the contract does not name never reach the api.
 */
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What a route accepts as a body: none, C10 JSON, or the C10 multipart upload. */
export type ApiBodyKind = 'none' | 'json' | 'multipart';

export interface ApiRoute {
  id: string;
  method: ApiMethod;
  pattern: string;
  body: ApiBodyKind;
  /** The route takes a query string (list and search routes, artifact path). */
  query: boolean;
  /** The response may carry `Set-Cookie` for the session (login, logout). */
  session: boolean;
  /** The request may carry a byte `Range` (artifact reads). */
  range: boolean;
  /** A tighter body cap than the BFF default for this body kind; null keeps the default. */
  maxBodyBytes: number | null;
}

/** Room for the multipart boundaries and the small text fields beside one uploaded file. */
const MULTIPART_FRAMING_BYTES = 64 * 1024;

type RouteRow = Pick<ApiRoute, 'id' | 'method' | 'pattern'> & Partial<Omit<ApiRoute, 'id' | 'method' | 'pattern'>>;

const rows: readonly RouteRow[] = [
  { id: 'health', method: 'GET', pattern: 'health' },
  { id: 'auth.login', method: 'POST', pattern: 'auth/login', body: 'json', session: true },
  { id: 'auth.logout', method: 'POST', pattern: 'auth/logout', session: true },
  { id: 'auth.session', method: 'GET', pattern: 'auth/session' },
  { id: 'catalog.search', method: 'GET', pattern: 'catalog/assets', query: true },
  { id: 'catalog.create', method: 'POST', pattern: 'catalog/assets', body: 'multipart' },
  // Rev 4 (SPEC 0002 section 13.2): JSON only; the api validates the path and never returns it for biometric rows.
  { id: 'catalog.create-by-reference', method: 'POST', pattern: 'catalog/assets/by-reference', body: 'json' },
  { id: 'catalog.versions', method: 'GET', pattern: 'catalog/assets/:assetId/versions', query: true },
  { id: 'catalog.save-version', method: 'POST', pattern: 'catalog/assets/:assetId/versions', body: 'multipart' },
  { id: 'catalog.save-metadata-version', method: 'POST', pattern: 'catalog/assets/:assetId/versions/from-previous', body: 'json' },
  { id: 'catalog.save-version-by-reference', method: 'POST', pattern: 'catalog/assets/:assetId/versions/by-reference', body: 'json' },
  { id: 'catalog.version', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version' },
  // SKILL.md text editing (skills page spec, T5): the entry file of one version as UTF-8 text.
  { id: 'catalog.entry-file', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/entry-file' },
  { id: 'catalog.image', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/image' },
  // Music preview (docs/specs/2026-11-25-music-preview.md): stored music bytes for the "Listen" button.
  { id: 'catalog.audio', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/audio' },
  // Guided creation (docs/specs/2026-11-23-guided-creation-design.md, amendment 1). The audio is
  // bytes, not JSON: the api sends `no-store` and `nosniff`, and the proxy passes both on. No query
  // is forwarded, so the player's cache-busting value never reaches the api.
  { id: 'catalog.voice-sample', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/voice-sample' },
  { id: 'catalog.voice-sample-request', method: 'POST', pattern: 'catalog/assets/:assetId/versions/:version/voice-sample', body: 'json' },
  { id: 'catalog.voice-sample-audio', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/voice-sample/audio' },
  { id: 'catalog.template-preview', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/template-preview' },
  { id: 'catalog.template-preview-clip', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/template-preview/clip' },
  { id: 'catalog.template-preview-poster', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/template-preview/poster' },
  { id: 'catalog.reference-analysis', method: 'GET', pattern: 'catalog/assets/:assetId/versions/:version/reference-analysis' },
  { id: 'catalog.reference-analysis-request', method: 'POST', pattern: 'catalog/assets/:assetId/versions/:version/reference-analysis' },
  // Catalog asset purpose (ADR 0012): Retry and Regenerate queue a new `asset-purpose` job.
  // The owner's own text (C-P4): `purposeSource: owner`, which no job overwrites.
  { id: 'catalog.purpose', method: 'PUT', pattern: 'catalog/assets/:assetId/versions/:version/purpose', body: 'json' },
  { id: 'catalog.purpose-generation', method: 'POST', pattern: 'catalog/assets/:assetId/versions/:version/purpose/generation' },
  // Purpose backfill (C-P4): the count for the catalog page button, and the confirmed batch request.
  { id: 'catalog.purpose-backfill-count', method: 'GET', pattern: 'catalog/assets/purposes/backfill' },
  { id: 'catalog.purpose-backfill', method: 'POST', pattern: 'catalog/assets/purposes/backfill' },
  { id: 'catalog.status', method: 'PUT', pattern: 'catalog/assets/:assetId/versions/:version/status', body: 'json' },
  // Rev 3 (SPEC 0003 section 4.3): the only way a version becomes `active`, one recorded owner approval per call.
  { id: 'catalog.promotion', method: 'POST', pattern: 'catalog/assets/:assetId/versions/:version/promotion', body: 'json' },
  { id: 'catalog.learning-status', method: 'PUT', pattern: 'catalog/assets/:assetId/versions/:version/learnings/:noteId/status', body: 'json' },
  // Rev 3: search by meaning is a POST so the query text never sits in a URL (access logs, history).
  { id: 'catalog.semantic-search', method: 'POST', pattern: 'catalog/search', body: 'json' },
  { id: 'catalog.search-status', method: 'GET', pattern: 'catalog/search/status' },
  { id: 'recipes.list', method: 'GET', pattern: 'recipes', query: true },
  { id: 'recipes.create', method: 'POST', pattern: 'recipes', body: 'json' },
  { id: 'recipes.save-version', method: 'POST', pattern: 'recipes/:recipeId/versions', body: 'json' },
  { id: 'recipes.version', method: 'GET', pattern: 'recipes/:recipeId/versions/:version' },
  { id: 'recipes.status', method: 'PUT', pattern: 'recipes/:recipeId/versions/:version/status', body: 'json' },
  { id: 'recipes.promotion', method: 'POST', pattern: 'recipes/:recipeId/versions/:version/promotion', body: 'json' },
  { id: 'runs.list', method: 'GET', pattern: 'runs', query: true },
  { id: 'runs.create', method: 'POST', pattern: 'runs', body: 'json' },
  { id: 'runs.state', method: 'GET', pattern: 'runs/:runId' },
  { id: 'runs.delete', method: 'DELETE', pattern: 'runs/:runId' },
  { id: 'runs.start', method: 'POST', pattern: 'runs/:runId/start' },
  { id: 'runs.events', method: 'GET', pattern: 'runs/:runId/events', query: true },
  { id: 'runs.artifact', method: 'GET', pattern: 'runs/:runId/artifact', query: true, range: true },
  { id: 'runs.control', method: 'POST', pattern: 'runs/:runId/control', body: 'json' },
  { id: 'runs.gate-decisions', method: 'POST', pattern: 'runs/:runId/gate-decisions', body: 'json' },
  { id: 'runs.review', method: 'POST', pattern: 'runs/:runId/review', body: 'json' },
  { id: 'runs.promote', method: 'POST', pattern: 'runs/:runId/promote', body: 'json' },
  { id: 'runs.save-video', method: 'POST', pattern: 'runs/:runId/save-video' },
  { id: 'runs.learnings', method: 'POST', pattern: 'runs/:runId/learnings', body: 'json' },
  // Rev 4: daemon-wide watcher state from the heartbeat file; session-guarded like every row but `health` and login.
  { id: 'watcher.status', method: 'GET', pattern: 'watcher' },
  // Rev 3: A/B comparisons. `start` carries the owner's accepted worst-case amount for both runs.
  { id: 'comparisons.list', method: 'GET', pattern: 'comparisons', query: true },
  { id: 'comparisons.create', method: 'POST', pattern: 'comparisons', body: 'json' },
  { id: 'comparisons.get', method: 'GET', pattern: 'comparisons/:comparisonId' },
  { id: 'comparisons.start', method: 'POST', pattern: 'comparisons/:comparisonId/start', body: 'json' },
  // Rev 4 (SPEC 0005 section 4.4): Curator proposals. `create` carries the owner's accepted $1.00;
  // no curation route sets a version status (AC 35).
  { id: 'curations.list', method: 'GET', pattern: 'curations', query: true },
  { id: 'curations.create', method: 'POST', pattern: 'curations', body: 'json' },
  { id: 'curations.get', method: 'GET', pattern: 'curations/:curationId' },
  { id: 'curations.decision', method: 'POST', pattern: 'curations/:curationId/decision', body: 'json' },
  // Rev 5 (SPEC 0006 section 4.4): publications, form metrics, CSV import and schedules. No R3
  // route fetches a URL, publishes, sets a run status or writes a schedule's cursor or slot log.
  { id: 'runs.publications', method: 'GET', pattern: 'runs/:runId/publications' },
  { id: 'runs.publications-create', method: 'POST', pattern: 'runs/:runId/publications', body: 'json' },
  { id: 'runs.publication-remove', method: 'DELETE', pattern: 'runs/:runId/publications/:publicationId' },
  { id: 'runs.publication-metrics', method: 'PUT', pattern: 'runs/:runId/publications/:publicationId/metrics/:asOfDate', body: 'json' },
  // The CSV is at most 2 MiB (`metricsBounds.maxFileBytes`); the cap here adds room for the two
  // text fields and the multipart framing, so a larger upload is refused before it reaches the api.
  {
    id: 'metrics.import',
    method: 'POST',
    pattern: 'metrics/imports',
    body: 'multipart',
    query: true,
    maxBodyBytes: metricsBounds.maxFileBytes + MULTIPART_FRAMING_BYTES,
  },
  { id: 'schedules.list', method: 'GET', pattern: 'schedules' },
  { id: 'schedules.create', method: 'POST', pattern: 'schedules', body: 'json' },
  { id: 'schedules.get', method: 'GET', pattern: 'schedules/:scheduleId' },
  { id: 'schedules.patch', method: 'PATCH', pattern: 'schedules/:scheduleId', body: 'json' },
  // Rev 6 (PRD 0001 R4 goal 4): the section 14 success metrics, read-only.
  { id: 'insights.get', method: 'GET', pattern: 'insights' },
  // Rev 7 (SPEC 0007 section 4.4): connected platforms and assisted publishing. The OAuth callback
  // `GET platforms/:platform/connection/callback` is deliberately absent: the platform sends the
  // browser straight to the api, never through the BFF. No row here uploads: a publish request is
  // recorded by the api and sent by the watcher between runs.
  { id: 'platforms.list', method: 'GET', pattern: 'platforms' },
  { id: 'platforms.gate', method: 'PATCH', pattern: 'platforms/:platform/gate', body: 'json' },
  { id: 'platforms.connect', method: 'POST', pattern: 'platforms/:platform/connection' },
  { id: 'platforms.disconnect', method: 'DELETE', pattern: 'platforms/:platform/connection' },
  { id: 'runs.publish', method: 'GET', pattern: 'runs/:runId/publish' },
  { id: 'runs.publish-request', method: 'POST', pattern: 'runs/:runId/publish/:platform', body: 'json' },
  { id: 'runs.publish-cancel', method: 'DELETE', pattern: 'runs/:runId/publish/attempts/:attemptId' },
];

export const apiRoutes: readonly ApiRoute[] = rows.map((row) => ({
  body: 'none',
  query: false,
  session: false,
  range: false,
  maxBodyBytes: null,
  ...row,
}));

const versionPattern = /^[1-9][0-9]{0,6}$/;

/** Parameter segments and the only values each accepts. */
const parameterCheckers: Readonly<Record<string, (value: string) => boolean>> = {
  assetId: (value) => AssetIdSchema.safeParse(value).success,
  recipeId: (value) => RecipeIdSchema.safeParse(value).success,
  runId: (value) => RunIdSchema.safeParse(value).success,
  version: (value) => versionPattern.test(value),
  noteId: (value) => LearningNoteIdSchema.safeParse(value).success,
  comparisonId: (value) => ComparisonIdSchema.safeParse(value).success,
  curationId: (value) => CurationIdSchema.safeParse(value).success,
  publicationId: (value) => PublicationIdSchema.safeParse(value).success,
  asOfDate: (value) => IsoDateSchema.safeParse(value).success,
  scheduleId: (value) => ScheduleIdSchema.safeParse(value).success,
  platform: (value) => PlatformSchema.safeParse(value).success,
  attemptId: (value) => PublishAttemptIdSchema.safeParse(value).success,
};

export interface MatchedApiRoute {
  route: ApiRoute;
  /** Absolute api path rebuilt from validated segments, e.g. `/catalog/assets/logo/versions/2`. */
  path: string;
}

function segmentMatches(patternSegment: string, value: string): boolean {
  if (!patternSegment.startsWith(':')) return patternSegment === value;
  const checker = parameterCheckers[patternSegment.slice(1)];
  return checker !== undefined && checker(value);
}

/** The allowlisted route for `method` and the path `segments`, or null when the contract has none. */
export function matchApiRoute(method: string, segments: readonly string[]): MatchedApiRoute | null {
  if (segments.length === 0 || segments.length > 8) return null;
  for (const route of apiRoutes) {
    if (route.method !== method) continue;
    const patternSegments = route.pattern.split('/');
    if (patternSegments.length !== segments.length) continue;
    const matches = patternSegments.every((patternSegment, index) => segmentMatches(patternSegment, segments[index] ?? ''));
    if (matches) return { route, path: `/${segments.join('/')}` };
  }
  return null;
}

/** Splits an `apiPaths` result (`/catalog/assets?x=1`) into segments and query, then matches it. */
export function matchApiPath(method: string, pathWithQuery: string): (MatchedApiRoute & { search: string }) | null {
  const queryStart = pathWithQuery.indexOf('?');
  const path = queryStart < 0 ? pathWithQuery : pathWithQuery.slice(0, queryStart);
  const search = queryStart < 0 ? '' : pathWithQuery.slice(queryStart);
  if (!path.startsWith('/')) return null;
  const matched = matchApiRoute(method, path.slice(1).split('/'));
  if (matched === null) return null;
  if (search !== '' && !matched.route.query) return null;
  return { ...matched, search };
}
