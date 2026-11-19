import { type AssetRef } from '@studio/shared/catalog';
import { type RunStatus } from '@studio/shared/run-format';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type ComparisonsErrorCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

/**
 * Base of every comparisons domain error. The api turns the class name into the C10 `reason`
 * (`ComparisonSubjectInvalidError` -> `comparison-subject-invalid`). Messages carry ids, refs,
 * statuses and amounts only, never brief text.
 */
export abstract class ComparisonsError extends Error {
  abstract readonly category: ComparisonsErrorCategory;
}

export class InvalidComparisonInputError extends ComparisonsError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid comparison input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidComparisonInputError';
  }
}

export type ComparisonSubjectProblem =
  | 'slot-not-bound'
  | 'not-a-comparable-pair'
  | 'compared-version-not-found'
  | 'kind-differs'
  | 'recipe-version-not-found'
  | 'recipe-version-not-runnable';

/** 422 `comparison-subject-invalid` (SPEC 0003 section 5.3 "Validation at POST /comparisons"). */
export class ComparisonSubjectInvalidError extends ComparisonsError {
  override readonly category = 'validation';

  constructor(
    readonly problem: ComparisonSubjectProblem,
    readonly ref: string,
  ) {
    super(`Comparison subject is invalid (${problem}): ${ref}`);
    this.name = 'ComparisonSubjectInvalidError';
  }
}

/** 422 `comparison-biometric-refused` (B13): biometric use is never doubled by default. */
export class ComparisonBiometricRefusedError extends ComparisonsError {
  override readonly category = 'validation';

  constructor(readonly ref: AssetRef) {
    super(`A comparison cannot use the biometric version ${ref}`);
    this.name = 'ComparisonBiometricRefusedError';
  }
}

export class ComparisonNotFoundError extends ComparisonsError {
  override readonly category = 'not_found';

  constructor(readonly comparisonId: string) {
    super(`Comparison not found: ${comparisonId}`);
    this.name = 'ComparisonNotFoundError';
  }
}

/** 409 `comparison-not-startable`: both runs must be `draft` and owned by no live watcher. */
export class ComparisonNotStartableError extends ComparisonsError {
  override readonly category = 'conflict';

  constructor(
    readonly comparisonId: string,
    readonly statuses: { a: RunStatus; b: RunStatus },
  ) {
    super(`Comparison ${comparisonId} cannot start: arm a is ${statuses.a}, arm b is ${statuses.b}`);
    this.name = 'ComparisonNotStartableError';
  }
}

/** 503 `month-spend-unavailable`: the gate fails closed when the month figure is unknown. */
export class MonthSpendUnavailableError extends ComparisonsError {
  override readonly category = 'dependency';

  constructor(readonly comparisonId: string) {
    super(`Month-to-date spend is unavailable; comparison ${comparisonId} was not started`);
    this.name = 'MonthSpendUnavailableError';
  }
}

/** 409 `comparison-estimate-changed`: the owner accepted another pair worst case than the server's. */
export class ComparisonEstimateChangedError extends ComparisonsError {
  override readonly category = 'conflict';

  constructor(
    readonly comparisonId: string,
    readonly acceptedWorstCaseUsd: number,
    readonly pairWorstCaseUsd: number,
  ) {
    super(`Comparison ${comparisonId}: accepted ${acceptedWorstCaseUsd} USD, the pair worst case is now ${pairWorstCaseUsd} USD`);
    this.name = 'ComparisonEstimateChangedError';
  }
}

/** 422 `comparison-over-month-ceiling`: month-to-date plus the pair worst case exceeds the ceiling. */
export class ComparisonOverMonthCeilingError extends ComparisonsError {
  override readonly category = 'validation';

  constructor(
    readonly comparisonId: string,
    readonly amounts: { monthToDateUsd: number; pairWorstCaseUsd: number; costPerMonthUsd: number },
  ) {
    super(
      `Comparison ${comparisonId}: ${amounts.monthToDateUsd} USD this month plus ${amounts.pairWorstCaseUsd} USD exceeds ${amounts.costPerMonthUsd} USD`,
    );
    this.name = 'ComparisonOverMonthCeilingError';
  }
}

/** The two run.json links do not name each other as this comparison's arms; a data-integrity problem. */
export class ComparisonLinkBrokenError extends ComparisonsError {
  override readonly category = 'internal';

  constructor(
    readonly comparisonId: string,
    readonly runId: string,
  ) {
    super(`Run ${runId} is not linked as an arm of comparison ${comparisonId}; rebuild the run index`);
    this.name = 'ComparisonLinkBrokenError';
  }
}

/** A stored `comparisons` row no longer satisfies C3; rebuild the run index from the run folders. */
export class ComparisonRowCorruptError extends ComparisonsError {
  override readonly category = 'internal';

  constructor(readonly comparisonId: string) {
    super(`Comparison row ${comparisonId} does not match the run contract; rebuild the run index`);
    this.name = 'ComparisonRowCorruptError';
  }
}
