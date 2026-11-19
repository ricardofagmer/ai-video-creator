import { metricImportRefusalReasons, type ApiRev5ErrorReason } from '@studio/shared/api';
import { type MetricImportRefusedReason, type Platform, type PublicationUrlRefusal } from '@studio/shared/metrics';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type MetricsErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/**
 * The C10 rev 5 `reason` of a metrics refusal (SPEC 0006 section 4.4, `apiRev5ErrorReasons`),
 * including `invalid-metrics-input` 422, `metrics-snapshot-limit-reached` 422 and
 * `metrics-row-corrupt` 500.
 */
export type MetricsErrorReason = ApiRev5ErrorReason | 'invalid-metrics-input' | 'metrics-snapshot-limit-reached' | 'metrics-row-corrupt';

/**
 * Base of every metrics domain error. `reason` is the C10 refusal reason, used by the api as is
 * (like curation errors). Messages carry ids, platforms, dates and counts only: never a URL, a
 * platform video id, a file name or a cell (SPEC 0006 K7).
 */
export abstract class MetricsError extends Error {
  abstract readonly category: MetricsErrorCategory;
  abstract readonly reason: MetricsErrorReason;
}

export class InvalidMetricsInputError extends MetricsError {
  override readonly category = 'validation';
  override readonly reason = 'invalid-metrics-input';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid metrics input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidMetricsInputError';
  }
}

/** 409 `publication-run-not-approved`: the run has no `approved` outcome row (L4). */
export class PublicationRunNotApprovedError extends MetricsError {
  override readonly category = 'conflict';
  override readonly reason = 'publication-run-not-approved';

  constructor(readonly runId: string) {
    super(`Run ${runId} is not approved; a publication can be recorded only for an approved run`);
    this.name = 'PublicationRunNotApprovedError';
  }
}

/** 422 `publication-url-not-recognized` or `publication-short-link-refused` (section 5.1). */
export class PublicationUrlRefusedError extends MetricsError {
  override readonly category = 'validation';

  constructor(override readonly reason: PublicationUrlRefusal) {
    super(reason === 'publication-short-link-refused' ? 'Short links are refused; they resolve only through a request' : 'The link is not a recognized video URL');
    this.name = 'PublicationUrlRefusedError';
  }
}

/** 409 `publication-already-linked`: the platform video is linked to a run already. */
export class PublicationAlreadyLinkedError extends MetricsError {
  override readonly category = 'conflict';
  override readonly reason = 'publication-already-linked';

  constructor(readonly platform: Platform) {
    super(`This ${platform} video is already linked to a run`);
    this.name = 'PublicationAlreadyLinkedError';
  }
}

/** 422 `publication-limit-reached`: 5 publications per run. */
export class PublicationLimitReachedError extends MetricsError {
  override readonly category = 'validation';
  override readonly reason = 'publication-limit-reached';

  constructor(
    readonly runId: string,
    readonly limit: number,
  ) {
    super(`Run ${runId} already has ${limit} publications`);
    this.name = 'PublicationLimitReachedError';
  }
}

/** 409 `publication-has-metrics`: a publication with snapshots cannot be removed. */
export class PublicationHasMetricsError extends MetricsError {
  override readonly category = 'conflict';
  override readonly reason = 'publication-has-metrics';

  constructor(readonly publicationId: string) {
    super(`Publication ${publicationId} has metric snapshots and cannot be removed`);
    this.name = 'PublicationHasMetricsError';
  }
}

/** 404 `publication-not-found`: no such publication on that run. */
export class PublicationNotFoundError extends MetricsError {
  override readonly category = 'not_found';
  override readonly reason = 'publication-not-found';

  constructor(
    readonly runId: string,
    readonly publicationId: string,
  ) {
    super(`Publication ${publicationId} not found on run ${runId}`);
    this.name = 'PublicationNotFoundError';
  }
}

/** 422 `metrics-as-of-in-future`: the form's `asOfDate` is after today on this Mac. */
export class MetricsAsOfInFutureError extends MetricsError {
  override readonly category = 'validation';
  override readonly reason = 'metrics-as-of-in-future';

  constructor(readonly asOfDate: string) {
    super(`The metrics date ${asOfDate} is in the future`);
    this.name = 'MetricsAsOfInFutureError';
  }
}

/** 422 `metrics-snapshot-limit-reached`: 400 snapshots per publication (`metricsBounds`). */
export class MetricSnapshotLimitReachedError extends MetricsError {
  override readonly category = 'validation';
  override readonly reason = 'metrics-snapshot-limit-reached';

  constructor(
    readonly publicationId: string,
    readonly limit: number,
  ) {
    super(`Publication ${publicationId} already has ${limit} metric snapshots`);
    this.name = 'MetricSnapshotLimitReachedError';
  }
}

/**
 * A refused CSV import (section 5.3); nothing was written. `refusal` is the shared refusal id and
 * `reason` the C10 reason the api and the CLI answer with (`metricImportRefusalReasons`). The
 * file's size is a refusal like the others; the api's rev 5 status table gives it 413.
 */
export class MetricImportRefusedError extends MetricsError {
  override readonly category = 'validation';
  override readonly reason: ApiRev5ErrorReason;

  constructor(
    readonly refusal: MetricImportRefusedReason,
    readonly platform: Platform,
  ) {
    super(`The ${platform} metrics import was refused: ${refusal}`);
    this.name = 'MetricImportRefusedError';
    this.reason = metricImportRefusalReasons[refusal];
  }
}

/** A stored metrics row no longer matches its contract; a data-integrity problem. */
export class MetricsRowCorruptError extends MetricsError {
  override readonly category = 'internal';
  override readonly reason = 'metrics-row-corrupt';

  constructor(
    readonly table: 'run_publications' | 'platform_metric_snapshots' | 'metric_imports',
    readonly id: string,
  ) {
    super(`A ${table} row (${id}) does not match its contract`);
    this.name = 'MetricsRowCorruptError';
  }
}
