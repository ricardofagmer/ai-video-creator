import { HttpException } from '@nestjs/common';
import { AssetJobError, InvalidAssetJobInputError } from '@studio/core/asset-jobs';
import { AssetStoreError, ContentTooLargeError } from '@studio/core/asset-store';
import { CatalogError, InvalidAssetInputError } from '@studio/core/catalog';
import { ComparisonsError, InvalidComparisonInputError } from '@studio/core/comparisons';
import { CostsError } from '@studio/core/costs';
import { CurationError, InvalidCurationInputError } from '@studio/core/curation';
import { EmbeddingsError, InvalidSemanticSearchError } from '@studio/core/embeddings';
import { InvalidLearningInputError, LearningsError } from '@studio/core/learnings';
import { InvalidMetricsInputError, MetricsError } from '@studio/core/metrics';
import { InvalidPlatformInputError, PlatformClientError, PlatformError } from '@studio/core/platforms';
import { InvalidPromotionInputError, PromotionError } from '@studio/core/promotion';
import { QualityError } from '@studio/core/quality';
import { CompositionConflictError, InvalidRecipeInputError, RecipesError } from '@studio/core/recipes';
import { InvalidReviewInputError, RequiredChecklistUncheckedError, ReviewError, ReviewNotAllowedError } from '@studio/core/review';
import { InvalidRunInputError, RunsError } from '@studio/core/runs';
import { InvalidScheduleInputError, ScheduleError } from '@studio/core/schedules';
import {
  apiGuidedCreationErrorReasons,
  apiRev4ErrorReasons,
  apiRev5ErrorReasons,
  apiRev7ErrorReasons,
  type ApiErrorCode,
  type ApiIssue,
} from '@studio/shared/api';
import { COMPOSITION_CONFLICTS_MAX, type CompositionConflict } from '@studio/shared/recipes';
import { RunFileError, type RunFileErrorCode } from '@studio/shared/run-files';
import { ApiError, LoginRateLimitedError, RequestValidationError } from './api.errors';

/** What the filter writes and logs for one failure. */
export interface MappedError {
  statusCode: number;
  code: ApiErrorCode;
  reason: string;
  message: string;
  issues?: ApiIssue[];
  itemIds?: string[];
  retryAfterSeconds?: number;
  /** The broken composition rules (`composition-conflict`), at most `COMPOSITION_CONFLICTS_MAX`. */
  conflicts?: CompositionConflict[];
  /** False for anything the api did not anticipate; logged with full context server-side. */
  expected: boolean;
}

type DomainCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

const categoryStatus: Readonly<Record<DomainCategory, { statusCode: number; code: ApiErrorCode }>> = {
  validation: { statusCode: 422, code: 'validation' },
  not_found: { statusCode: 404, code: 'not_found' },
  conflict: { statusCode: 409, code: 'conflict' },
  dependency: { statusCode: 503, code: 'dependency' },
  internal: { statusCode: 500, code: 'internal' },
};

const statusCodes: Readonly<Record<number, ApiErrorCode>> = {
  400: 'validation',
  401: 'auth',
  403: 'auth',
  404: 'not_found',
  405: 'validation',
  409: 'conflict',
  413: 'validation',
  415: 'validation',
  422: 'validation',
  429: 'rate_limited',
  503: 'dependency',
};

/** Run-file failures name the file in their message, so only these fixed texts reach a client. */
const runFileMapping: Readonly<Record<RunFileErrorCode, { statusCode: number; code: ApiErrorCode; message: string }>> = {
  'not-found': { statusCode: 404, code: 'not_found', message: 'A run file was not found' },
  'invalid-json': { statusCode: 500, code: 'internal', message: 'A run file is not readable' },
  'schema-mismatch': { statusCode: 500, code: 'internal', message: 'A run file does not match the run format' },
  'unsupported-format': { statusCode: 409, code: 'conflict', message: 'The run uses a newer run format; update the studio' },
  'write-failed': { statusCode: 500, code: 'internal', message: 'A run file could not be written' },
  'path-outside-run': { statusCode: 400, code: 'validation', message: 'The path is not inside the run folder' },
  'append-only-violated': { statusCode: 409, code: 'conflict', message: 'The event log changed; read it again from byte 0' },
};

/** `AssetNotFoundError` -> `asset-not-found`. */
export function reasonOf(name: string): string {
  const reason = name
    .replace(/Error$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return reason === '' ? 'error' : reason.slice(0, 80);
}

function domainIssues(error: unknown): ApiIssue[] | undefined {
  if (
    error instanceof InvalidAssetInputError ||
    error instanceof InvalidRecipeInputError ||
    error instanceof InvalidRunInputError ||
    error instanceof InvalidReviewInputError ||
    error instanceof InvalidPromotionInputError ||
    error instanceof InvalidLearningInputError ||
    error instanceof InvalidComparisonInputError ||
    error instanceof InvalidCurationInputError ||
    error instanceof InvalidSemanticSearchError ||
    error instanceof InvalidMetricsInputError ||
    error instanceof InvalidScheduleInputError ||
    error instanceof InvalidPlatformInputError ||
    error instanceof InvalidAssetJobInputError
  ) {
    return error.issues.slice(0, 50).map((issue) => ({ path: issue.path.slice(0, 200), message: issue.message.slice(0, 500) }));
  }
  return undefined;
}

function mapDomainError(error: Error & { category: DomainCategory }): MappedError {
  const target = categoryStatus[error.category];
  const isInternal = error.category === 'internal';
  const tooLarge = error instanceof ContentTooLargeError;
  return {
    statusCode: tooLarge ? 413 : target.statusCode,
    code: target.code,
    reason: reasonOf(error.name),
    // Core domain messages carry ids, refs and statuses only (their base classes promise it);
    // internal ones may describe storage, so they get a fixed text.
    message: isInternal ? 'Internal error' : error.message,
    issues: domainIssues(error),
    expected: !isInternal,
  };
}

/** C10 rev 4 (SPEC 0005 section 4.4): the frozen status of each curation refusal reason. */
const rev4ReasonStatus: Readonly<Record<string, number>> = apiRev4ErrorReasons;

/**
 * Curation errors carry their C10 `reason` (SPEC 0005 section 4.4), so it is used as is instead of
 * being derived from the class name. The status is the frozen rev 4 one; the three reasons outside
 * that table take their category: `month-spend-unavailable` 503, `invalid-curation-input` 422 and
 * `curation-file-corrupt` 500. Curation messages carry ids, refs, statuses and amounts only (K7);
 * the internal one gets the fixed text so no file detail reaches a client.
 */
function mapCurationError(error: CurationError): MappedError {
  const target = categoryStatus[error.category];
  const isInternal = error.category === 'internal';
  const statusCode = rev4ReasonStatus[error.reason] ?? target.statusCode;
  return {
    statusCode,
    code: statusCodes[statusCode] ?? target.code,
    reason: error.reason,
    message: isInternal ? 'Internal error' : error.message,
    issues: domainIssues(error),
    expected: !isInternal,
  };
}

/** C10 rev 5 (SPEC 0006 section 4.4): the frozen status of each publication, metrics and schedule reason. */
const rev5ReasonStatus: Readonly<Record<string, number>> = apiRev5ErrorReasons;

/**
 * Metrics and schedule errors carry their C10 `reason`, used as is, and the status is the frozen
 * rev 5 one (`metrics-file-too-large` 413 although its category is validation;
 * `schedule-file-corrupt` and `metrics-row-corrupt` 500). A reason outside the table takes its
 * category. Their messages carry ids, platforms, dates, counts and amounts only (K7); a 500 gets
 * the fixed text so no storage detail reaches a client.
 */
function mapRev5Error(error: MetricsError | ScheduleError): MappedError {
  const target = categoryStatus[error.category];
  const statusCode = rev5ReasonStatus[error.reason] ?? target.statusCode;
  const isInternal = statusCode >= 500 || error.category === 'internal';
  return {
    statusCode,
    code: statusCodes[statusCode] ?? (isInternal ? 'internal' : target.code),
    reason: error.reason,
    message: isInternal ? 'Internal error' : error.message,
    issues: domainIssues(error),
    expected: !isInternal,
  };
}

/** C10 rev 7 (SPEC 0007 section 4.4): the frozen status of each platform and publish reason. */
const rev7ReasonStatus: Readonly<Record<string, number>> = apiRev7ErrorReasons;

/** Rev 7 adds 502 `oauth-exchange-failed`: the platform, a dependency, did not complete the exchange. */
const rev7StatusCodes: Readonly<Record<number, ApiErrorCode>> = { ...statusCodes, 502: 'dependency' };

/**
 * Platform errors carry their C10 `reason` (SPEC 0007 section 4.4), used as is, and the status is
 * the frozen rev 7 one (`oauth-state-invalid` 400, `oauth-exchange-failed` 502, `keychain-unavailable`
 * 503, `publish-visibility-not-allowed` 422, `publish-attempt-not-found` 404, the rest 409;
 * `platform-publish-unsupported` is Instagram publish, OD8). A reason outside the table takes its
 * category: `invalid-platform-input` 422, `platform-file-corrupt`, `platform-row-corrupt` and
 * `publish-request-write-failed` 500. Platform messages carry ids, platform names, states and
 * reason ids only (K7); an internal one gets the fixed text so no file detail reaches a client.
 */
function mapPlatformError(error: PlatformError): MappedError {
  const target = categoryStatus[error.category];
  const statusCode = rev7ReasonStatus[error.reason] ?? target.statusCode;
  const isInternal = error.category === 'internal';
  return {
    statusCode,
    code: isInternal ? 'internal' : (rev7StatusCodes[statusCode] ?? target.code),
    reason: error.reason,
    message: isInternal ? 'Internal error' : error.message,
    issues: domainIssues(error),
    expected: !isInternal,
  };
}

/** Guided-creation spec: the frozen status of each asset job and composition reason. */
const guidedCreationReasonStatus: Readonly<Record<string, number>> = apiGuidedCreationErrorReasons;

/**
 * Asset job errors carry their `reason`, used as is, and the status is the frozen guided-creation
 * one (`asset-job-queue-full` 409, `asset-job-sample-not-ready` 404, the other refusals 422). The
 * two reasons outside the table take their category, like `invalid-curation-input` (422) and
 * `curation-file-corrupt` (500). Messages carry refs, kinds and counts only, never a sample's path;
 * an internal one gets the fixed text so no file detail reaches a client.
 */
function mapAssetJobError(error: AssetJobError): MappedError {
  const target = categoryStatus[error.category];
  const statusCode = guidedCreationReasonStatus[error.reason] ?? target.statusCode;
  const isInternal = error.category === 'internal';
  return {
    statusCode,
    code: isInternal ? 'internal' : (statusCodes[statusCode] ?? target.code),
    reason: error.reason,
    message: isInternal ? 'Internal error' : error.message,
    issues: domainIssues(error),
    expected: !isInternal,
  };
}

/** 422 `composition-conflict` with the rule ids and numbers; the web builds the owner's message from them. */
function mapCompositionConflict(error: CompositionConflictError): MappedError {
  const statusCode = apiGuidedCreationErrorReasons['composition-conflict'];
  return {
    statusCode,
    code: statusCodes[statusCode] ?? 'validation',
    reason: error.reason,
    message: error.message,
    conflicts: error.conflicts.slice(0, COMPOSITION_CONFLICTS_MAX),
    expected: true,
  };
}

function mapHttpException(error: HttpException): MappedError {
  const statusCode = error.getStatus();
  const code = statusCodes[statusCode] ?? (statusCode >= 500 ? 'internal' : 'validation');
  // Nest's built-in texts echo the request path ("Cannot GET /x"); a fixed text replaces them.
  return { statusCode, code, reason: `http-${statusCode}`, message: `Request failed with status ${statusCode}`, expected: statusCode < 500 };
}

export function mapError(error: unknown): MappedError {
  if (error instanceof RequestValidationError) {
    return { statusCode: 400, code: 'validation', reason: 'invalid-request', message: error.message, issues: [...error.issues], expected: true };
  }
  if (error instanceof LoginRateLimitedError) {
    return { ...baseOf(error), retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error instanceof ApiError) return baseOf(error);
  if (error instanceof RequiredChecklistUncheckedError) {
    const itemIds = error.itemIds.slice(0, 20).map((itemId) => String(itemId).slice(0, 64));
    return { statusCode: 422, code: 'validation', reason: 'required-checklist-unchecked', message: 'Required checklist items are unchecked', itemIds, expected: true };
  }
  if (error instanceof ReviewNotAllowedError) {
    return { statusCode: 409, code: 'conflict', reason: 'review-not-allowed', message: 'The run cannot take this decision now', expected: true };
  }
  if (error instanceof CurationError) return mapCurationError(error);
  if (error instanceof MetricsError || error instanceof ScheduleError) return mapRev5Error(error);
  if (error instanceof PlatformError) return mapPlatformError(error);
  if (error instanceof AssetJobError) return mapAssetJobError(error);
  // Before the generic recipes branch: it is a `RecipesError` that also carries its conflict list.
  if (error instanceof CompositionConflictError) return mapCompositionConflict(error);
  if (
    error instanceof CatalogError ||
    error instanceof RecipesError ||
    error instanceof RunsError ||
    error instanceof CostsError ||
    error instanceof ReviewError ||
    error instanceof AssetStoreError ||
    // Rev 3 (SPEC 0003 section 4.3): reasons are derived from the class names, e.g.
    // `PromotionApprovalRequiredError` (a catalog and a recipes error) -> 422
    // `promotion-approval-required`, `MonthSpendUnavailableError` -> 503 `month-spend-unavailable`.
    error instanceof PromotionError ||
    error instanceof LearningsError ||
    error instanceof ComparisonsError ||
    error instanceof EmbeddingsError ||
    error instanceof QualityError ||
    // Rev 7: core converts every connect and disconnect client failure into a `PlatformError`, so
    // one reaching here is unanticipated; 503 `platform-client` with the client's id-only message.
    error instanceof PlatformClientError
  ) {
    return mapDomainError(error);
  }
  if (error instanceof RunFileError) {
    const target = runFileMapping[error.code];
    return { ...target, reason: `run-file-${error.code}`, expected: target.statusCode < 500 };
  }
  if (error instanceof HttpException) return mapHttpException(error);
  return { statusCode: 500, code: 'internal', reason: 'internal-error', message: 'Internal error', expected: false };
}

function baseOf(error: ApiError): MappedError {
  return {
    statusCode: error.statusCode,
    code: error.code,
    reason: reasonOf(error.name),
    message: error.message,
    expected: error.statusCode < 500,
  };
}
