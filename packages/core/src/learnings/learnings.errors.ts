import { type AssetRef } from '@studio/shared/catalog';
import { type RunStatus } from '@studio/shared/run-format';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type LearningsErrorCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

/**
 * Base of every learnings domain error (SPEC 0003 section 5.5). Messages carry run ids, refs, note
 * ids and statuses only: never a note's text, which is untrusted data (section 6). The api derives
 * the reason id from the class name (`LearningRefNotUsedError` -> `learning-ref-not-used`).
 */
export abstract class LearningsError extends Error {
  abstract readonly category: LearningsErrorCategory;
}

/** Issue messages are fixed texts or zod messages; none echoes the note. */
export class InvalidLearningInputError extends LearningsError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid learning input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidLearningInputError';
  }
}

/** 409 `learning-run-not-reviewed`: outputs are final only from `review` on. */
export class LearningRunNotReviewedError extends LearningsError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly status: RunStatus,
  ) {
    super(`Run ${runId} is ${status}; a learning is saved only from a run at review or later`);
    this.name = 'LearningRunNotReviewedError';
  }
}

/** 422 `learning-ref-not-used`: the ref is not in the run's manifest assets or references. */
export class LearningRefNotUsedError extends LearningsError {
  override readonly category = 'validation';

  constructor(
    readonly runId: string,
    readonly ref: AssetRef,
  ) {
    super(`Run ${runId} did not use ${ref}`);
    this.name = 'LearningRefNotUsedError';
  }
}

/** 422 `learning-biometric-refused` (B17): biometric versions carry no notes. */
export class LearningBiometricRefusedError extends LearningsError {
  override readonly category = 'validation';

  constructor(readonly ref: AssetRef) {
    super(`${ref} is biometric; it takes no learning notes`);
    this.name = 'LearningBiometricRefusedError';
  }
}

/** 422 `learning-contains-secret` (R2-AC-25): refused, never stored redacted. */
export class LearningContainsSecretError extends LearningsError {
  override readonly category = 'validation';

  constructor(
    readonly runId: string,
    readonly ref: AssetRef,
  ) {
    super(`The note for ${ref} from run ${runId} matches a secret pattern; nothing was stored`);
    this.name = 'LearningContainsSecretError';
  }
}

/** 422 `learning-limit-reached` (B17): at most 20 active notes per version. */
export class LearningLimitReachedError extends LearningsError {
  override readonly category = 'validation';

  constructor(
    readonly ref: AssetRef,
    readonly limit: number,
  ) {
    super(`${ref} already has ${limit} active notes; retire one first`);
    this.name = 'LearningLimitReachedError';
  }
}

/** The note could not be scanned for secret shapes; fails closed, nothing is stored. */
export class LearningSecretScanUnavailableError extends LearningsError {
  override readonly category = 'dependency';

  constructor(readonly ref: AssetRef) {
    super(`The note for ${ref} could not be scanned; nothing was stored`);
    this.name = 'LearningSecretScanUnavailableError';
  }
}

/** The note does not exist, or belongs to another version than the one in the path. */
export class LearningNoteNotFoundError extends LearningsError {
  override readonly category = 'not_found';

  constructor(
    readonly ref: AssetRef,
    readonly noteId: string,
  ) {
    super(`Learning note ${noteId} not found on ${ref}`);
    this.name = 'LearningNoteNotFoundError';
  }
}

/** A note is retired once; nothing is deleted or reactivated. */
export class LearningAlreadyRetiredError extends LearningsError {
  override readonly category = 'conflict';

  constructor(readonly noteId: string) {
    super(`Learning note ${noteId} is already retired`);
    this.name = 'LearningAlreadyRetiredError';
  }
}

/** A stored note no longer matches C1; a data-integrity problem, never a user error. */
export class LearningNoteCorruptError extends LearningsError {
  override readonly category = 'internal';

  constructor(readonly noteId: string) {
    super(`Learning note ${noteId} does not match the learning note contract`);
    this.name = 'LearningNoteCorruptError';
  }
}
