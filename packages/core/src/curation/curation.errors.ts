import { type apiRev4ErrorReasons } from '@studio/shared/api';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type CurationErrorCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

/** The C10 rev 4 `reason` of a curation refusal (SPEC 0005 section 4.4). */
export type CurationErrorReason = keyof typeof apiRev4ErrorReasons | 'month-spend-unavailable' | 'invalid-curation-input' | 'curation-file-corrupt';

/**
 * Base of every curation domain error. `reason` is the C10 refusal reason; each class is also named
 * so the api's `reasonOf(name)` yields the same string. Messages carry ids, refs, statuses and
 * amounts only: never a body, note, focus, reason, summary or diff text (SPEC 0005 K7).
 */
export abstract class CurationError extends Error {
  abstract readonly category: CurationErrorCategory;
  abstract readonly reason: CurationErrorReason;
}

export class InvalidCurationInputError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'invalid-curation-input';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid curation input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidCurationInputError';
  }
}

/** 404 `curation-subject-not-found`. */
export class CurationSubjectNotFoundError extends CurationError {
  override readonly category = 'not_found';
  override readonly reason = 'curation-subject-not-found';

  constructor(readonly ref: string) {
    super(`Curation subject not found: ${ref}`);
    this.name = 'CurationSubjectNotFoundError';
  }
}

/** 422 `curation-subject-not-curatable`: not a prompt, skill or recipe text body that can be read. */
export class CurationSubjectNotCuratableError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'curation-subject-not-curatable';

  constructor(readonly ref: string) {
    super(`Curation subject is not curatable: ${ref}`);
    this.name = 'CurationSubjectNotCuratableError';
  }
}

/** 422 `curation-subject-biometric`. */
export class CurationSubjectBiometricError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'curation-subject-biometric';

  constructor(readonly ref: string) {
    super(`Curation subject is biometric: ${ref}`);
    this.name = 'CurationSubjectBiometricError';
  }
}

/** 422 `curation-subject-deprecated`. */
export class CurationSubjectDeprecatedError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'curation-subject-deprecated';

  constructor(readonly ref: string) {
    super(`Curation subject is deprecated: ${ref}`);
    this.name = 'CurationSubjectDeprecatedError';
  }
}

/** 422 `curation-subject-body-too-large`: more than 16,000 characters. */
export class CurationSubjectBodyTooLargeError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'curation-subject-body-too-large';

  constructor(readonly ref: string) {
    super(`Curation subject body exceeds 16000 characters: ${ref}`);
    this.name = 'CurationSubjectBodyTooLargeError';
  }
}

/** 422 `curation-no-reviewed-runs` (B4): no run of the subject has an owner decision. */
export class CurationNoReviewedRunsError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'curation-no-reviewed-runs';

  constructor(readonly ref: string) {
    super(`No reviewed run used the curation subject ${ref}`);
    this.name = 'CurationNoReviewedRunsError';
  }
}

/** 422 `curation-over-month-ceiling`: month-to-date plus $1.00 exceeds the month ceiling. */
export class CurationOverMonthCeilingError extends CurationError {
  override readonly category = 'validation';
  override readonly reason = 'curation-over-month-ceiling';

  constructor(readonly amounts: { monthToDateUsd: number; worstCaseUsd: number; costPerMonthUsd: number }) {
    super(`${amounts.monthToDateUsd} USD this month plus ${amounts.worstCaseUsd} USD exceeds ${amounts.costPerMonthUsd} USD`);
    this.name = 'CurationOverMonthCeilingError';
  }
}

/** 409 `curation-queue-full`: 3 curations already `requested`. */
export class CurationQueueFullError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-queue-full';

  constructor(readonly queued: number) {
    super(`The curation queue is full (${queued} waiting)`);
    this.name = 'CurationQueueFullError';
  }
}

/** 409 `curation-already-requested` (B5): the subject has a `requested` or `collecting` curation. */
export class CurationAlreadyRequestedError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-already-requested';

  constructor(
    readonly ref: string,
    readonly curationId: string,
  ) {
    super(`Curation ${curationId} already waits or runs for ${ref}`);
    this.name = 'CurationAlreadyRequestedError';
  }
}

/** 409 `curation-estimate-changed` (B3): the consent is not $1.00 to the cent. */
export class CurationEstimateChangedError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-estimate-changed';

  constructor(
    readonly acceptedWorstCaseUsd: number,
    readonly worstCaseUsd: number,
  ) {
    super(`Accepted ${acceptedWorstCaseUsd} USD; a curation may spend up to ${worstCaseUsd} USD`);
    this.name = 'CurationEstimateChangedError';
  }
}

/**
 * 503 `month-spend-unavailable`: the gate fails closed when the month figure is unknown. Named
 * like the comparisons error so `reasonOf(name)` gives the same C10 reason.
 */
export class CurationMonthSpendUnavailableError extends CurationError {
  override readonly category = 'dependency';
  override readonly reason = 'month-spend-unavailable';

  constructor() {
    super('Month-to-date spend is unavailable; the curation was not requested');
    this.name = 'MonthSpendUnavailableError';
  }
}

/** 404 `curation-not-found`. */
export class CurationNotFoundError extends CurationError {
  override readonly category = 'not_found';
  override readonly reason = 'curation-not-found';

  constructor(readonly curationId: string) {
    super(`Curation not found: ${curationId}`);
    this.name = 'CurationNotFoundError';
  }
}

/** 409 `curation-not-decidable`: the status is not `proposed`. */
export class CurationNotDecidableError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-not-decidable';

  constructor(
    readonly curationId: string,
    readonly status: string,
  ) {
    super(`Curation ${curationId} is ${status}; only a proposed curation can be decided`);
    this.name = 'CurationNotDecidableError';
  }
}

/** 409 `curation-already-decided`. */
export class CurationAlreadyDecidedError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-already-decided';

  constructor(readonly curationId: string) {
    super(`Curation ${curationId} is already decided`);
    this.name = 'CurationAlreadyDecidedError';
  }
}

/** 409 `curation-not-saved`: compare before save-draft, or a comparison already exists. */
export class CurationNotSavedError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-not-saved';

  constructor(readonly curationId: string) {
    super(`Curation ${curationId} has no saved draft without a comparison`);
    this.name = 'CurationNotSavedError';
  }
}

/** 409 `curation-subject-refused`: the subject became deprecated or biometric, or is gone. */
export class CurationSubjectRefusedError extends CurationError {
  override readonly category = 'conflict';
  override readonly reason = 'curation-subject-refused';

  constructor(
    readonly curationId: string,
    readonly ref: string,
  ) {
    super(`Curation ${curationId}: the subject ${ref} can no longer be saved from`);
    this.name = 'CurationSubjectRefusedError';
  }
}

/** A curation file or decision row no longer matches its contract; a data-integrity problem. */
export class CurationFileCorruptError extends CurationError {
  override readonly category = 'internal';
  override readonly reason = 'curation-file-corrupt';

  constructor(
    readonly curationId: string,
    readonly file: 'curation.json' | 'proposal.json' | 'curation_decisions',
  ) {
    super(`Curation ${curationId}: ${file} does not match its contract`);
    this.name = 'CurationFileCorruptError';
  }
}
