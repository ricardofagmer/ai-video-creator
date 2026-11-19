import { HttpException } from '@nestjs/common';
import { AssetStoreError, ContentTooLargeError } from '@studio/core/asset-store';
import { CatalogError, InvalidAssetInputError } from '@studio/core/catalog';
import { ComparisonsError, InvalidComparisonInputError } from '@studio/core/comparisons';
import { CostsError } from '@studio/core/costs';
import { CurationError, InvalidCurationInputError } from '@studio/core/curation';
import { EmbeddingsError, InvalidSemanticSearchError } from '@studio/core/embeddings';
import { InvalidLearningInputError, LearningsError } from '@studio/core/learnings';
import { InvalidPromotionInputError, PromotionError } from '@studio/core/promotion';
import { QualityError } from '@studio/core/quality';
import { InvalidRecipeInputError, RecipesError } from '@studio/core/recipes';
import { InvalidReviewInputError, RequiredChecklistUncheckedError, ReviewError, ReviewNotAllowedError } from '@studio/core/review';
import { InvalidRunInputError, RunsError } from '@studio/core/runs';
import { apiRev4ErrorReasons, type ApiErrorCode, type ApiIssue } from '@studio/shared/api';
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
    error instanceof InvalidSemanticSearchError
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
    error instanceof QualityError
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
