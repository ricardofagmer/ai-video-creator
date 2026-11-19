import { type ApiRev5ErrorReason } from '@studio/shared/api';
import { type RecipeRef } from '@studio/shared/recipes';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type ScheduleErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/**
 * The C10 rev 5 `reason` of a schedule refusal (SPEC 0006 section 4.4, `apiRev5ErrorReasons`),
 * including malformed input, a schedule file that no longer matches its contract, and a brief
 * change the file rules refuse (a used brief, the last brief, more than 50).
 */
export type ScheduleErrorReason =
  | Extract<ApiRev5ErrorReason, `schedule-${string}`>
  | 'invalid-schedule-input'
  | 'schedule-file-corrupt'
  | 'schedule-brief-change-refused';

/**
 * Base of every schedule domain error. Messages carry ids, refs, counts and amounts only: never a
 * title or brief text (SPEC 0006 K7).
 */
export abstract class ScheduleError extends Error {
  abstract readonly category: ScheduleErrorCategory;
  abstract readonly reason: ScheduleErrorReason;
}

export class InvalidScheduleInputError extends ScheduleError {
  override readonly category = 'validation';
  override readonly reason = 'invalid-schedule-input';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid schedule input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidScheduleInputError';
  }
}

/** 404 `schedule-not-found`. */
export class ScheduleNotFoundError extends ScheduleError {
  override readonly category = 'not_found';
  override readonly reason = 'schedule-not-found';

  constructor(readonly scheduleId: string) {
    super(`Schedule not found: ${scheduleId}`);
    this.name = 'ScheduleNotFoundError';
  }
}

/** 422 `schedule-limit-reached`: 10 schedules whose status is not `deleted` already exist. */
export class ScheduleLimitReachedError extends ScheduleError {
  override readonly category = 'validation';
  override readonly reason = 'schedule-limit-reached';

  constructor(readonly existing: number) {
    super(`The schedule limit is reached (${existing} not deleted)`);
    this.name = 'ScheduleLimitReachedError';
  }
}

/** Which check of SPEC 0006 section 5.5 step 3 refused the pinned recipe. */
export type ScheduleRecipeProblem =
  | 'recipe-not-found'
  | 'recipe-not-runnable'
  | 'bindings-unresolvable'
  | 'references-unresolvable'
  | 'brief-inputs-missing';

/** 422 `schedule-recipe-not-runnable`: the same checks as `RunDraftService.create`, for every brief. */
export class ScheduleRecipeNotRunnableError extends ScheduleError {
  override readonly category = 'validation';
  override readonly reason = 'schedule-recipe-not-runnable';

  constructor(
    readonly ref: RecipeRef,
    readonly problem: ScheduleRecipeProblem,
  ) {
    super(`Recipe ${ref} cannot back a schedule: ${problem}`);
    this.name = 'ScheduleRecipeNotRunnableError';
  }
}

/** 409 `schedule-estimate-changed`: the consent is not the recipe's resolved `costPerRunUsd` to the cent. */
export class ScheduleEstimateChangedError extends ScheduleError {
  override readonly category = 'conflict';
  override readonly reason = 'schedule-estimate-changed';

  constructor(
    readonly acceptedWorstCasePerRunUsd: number,
    readonly costPerRunUsd: number,
  ) {
    super(`Accepted ${acceptedWorstCasePerRunUsd} USD per run; the recipe allows up to ${costPerRunUsd} USD`);
    this.name = 'ScheduleEstimateChangedError';
  }
}

/** What made the slot time invalid. */
export type ScheduleTimeProblem = 'timezone' | 'recurrence' | 'no-future-slot';

/** 422 `schedule-time-invalid`: unknown zone, malformed recurrence, or a `once` slot not in the future. */
export class ScheduleTimeInvalidError extends ScheduleError {
  override readonly category = 'validation';
  override readonly reason = 'schedule-time-invalid';

  constructor(readonly problem: ScheduleTimeProblem) {
    super(`Schedule time is invalid: ${problem}`);
    this.name = 'ScheduleTimeInvalidError';
  }
}

/** 409 `schedule-not-editable`: the schedule is `deleted`, which is final. */
export class ScheduleNotEditableError extends ScheduleError {
  override readonly category = 'conflict';
  override readonly reason = 'schedule-not-editable';

  constructor(readonly scheduleId: string) {
    super(`Schedule ${scheduleId} is deleted and cannot change`);
    this.name = 'ScheduleNotEditableError';
  }
}

/** Why a brief change was refused (SPEC 0006 section 5.5 and the file rules of section 4.3). */
export type ScheduleBriefChangeProblem = 'brief-used' | 'brief-not-found' | 'last-brief' | 'too-many-briefs';

/** 409 `schedule-brief-change-refused`. */
export class ScheduleBriefChangeRefusedError extends ScheduleError {
  override readonly category = 'conflict';
  override readonly reason = 'schedule-brief-change-refused';

  constructor(
    readonly scheduleId: string,
    readonly problem: ScheduleBriefChangeProblem,
  ) {
    super(`Schedule ${scheduleId}: brief change refused (${problem})`);
    this.name = 'ScheduleBriefChangeRefusedError';
  }
}

/** A schedule file no longer matches its contract; a data-integrity problem, never guessed around. */
export class ScheduleFileCorruptError extends ScheduleError {
  override readonly category = 'internal';
  override readonly reason = 'schedule-file-corrupt';

  constructor(
    readonly scheduleId: string,
    readonly file: 'schedule.json' | 'cursor.json' | 'slots.jsonl',
  ) {
    super(`Schedule ${scheduleId}: ${file} does not match its contract`);
    this.name = 'ScheduleFileCorruptError';
  }
}
