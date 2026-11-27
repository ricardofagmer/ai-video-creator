import { type AssetRef, type AssetStatus } from '@studio/shared/catalog';
import { type BriefField, type RecipeRef } from '@studio/shared/recipes';
import { type RunStatus } from '@studio/shared/run-format';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type RunsErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/** Base of every runs domain error. Messages carry ids, refs and statuses only, never brief text. */
export abstract class RunsError extends Error {
  abstract readonly category: RunsErrorCategory;
}

export class InvalidRunInputError extends RunsError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid run input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidRunInputError';
  }
}

/** A deprecated recipe version stays resolvable for past runs only. */
export class RecipeNotRunnableError extends RunsError {
  override readonly category = 'conflict';

  constructor(
    readonly ref: RecipeRef,
    readonly status: AssetStatus,
  ) {
    super(`Recipe ${ref} is ${status}; start the run from a draft or active version`);
    this.name = 'RecipeNotRunnableError';
  }
}

/** PRD 6 `inputs`: the brief lacks what the recipe requires. */
export class BriefInputsMissingError extends RunsError {
  override readonly category = 'validation';

  constructor(
    readonly ref: RecipeRef,
    readonly missing: readonly BriefField[],
  ) {
    super(`Recipe ${ref} requires brief fields: ${missing.join(', ')}`);
    this.name = 'BriefInputsMissingError';
  }
}

export class RunReferenceNotFoundError extends RunsError {
  override readonly category = 'validation';

  constructor(readonly refs: readonly AssetRef[]) {
    super(`Run references not found in the catalog: ${refs.join(', ')}`);
    this.name = 'RunReferenceNotFoundError';
  }
}

/**
 * docs/specs/2026-11-25-site-capture-and-visual-media-design.md: the brief has a site address and
 * the owner did not answer whether its screenshots go in the video.
 */
export class SiteCaptureUnansweredError extends RunsError {
  override readonly category = 'validation';

  constructor() {
    super('The brief has a sourceUrl and no siteCapture answer');
    this.name = 'SiteCaptureUnansweredError';
  }
}

/** The owner asked for the site's screenshots and the preset has no `capture` stage to record them. */
export class SiteCaptureDisabledError extends RunsError {
  override readonly category = 'validation';

  constructor(readonly ref: RecipeRef) {
    super(`Recipe ${ref} has no capture stage to record the site`);
    this.name = 'SiteCaptureDisabledError';
  }
}

/** No site capture, no image and no video clip: the video would have nothing but text on screen. */
export class RunWithoutPicturesError extends RunsError {
  override readonly category = 'validation';

  constructor() {
    super('The run has no site capture, no image and no video clip');
    this.name = 'RunWithoutPicturesError';
  }
}

export class RunNotFoundError extends RunsError {
  override readonly category = 'not_found';

  constructor(readonly runId: string) {
    super(`Run not found: ${runId}`);
    this.name = 'RunNotFoundError';
  }
}

/** run.json names another run than its folder; the folder is not trusted. */
export class RunFolderMismatchError extends RunsError {
  override readonly category = 'internal';

  constructor(
    readonly folderRunId: string,
    readonly fileRunId: string,
  ) {
    super(`Run folder ${folderRunId} holds run.json of run ${fileRunId}`);
    this.name = 'RunFolderMismatchError';
  }
}

export class RunStatusConflictError extends RunsError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly status: RunStatus,
    readonly expected: RunStatus,
  ) {
    super(`Run ${runId} is ${status}; expected ${expected}`);
    this.name = 'RunStatusConflictError';
  }
}

/** ADR 0003: while a watcher pid is alive, the watcher is the sole writer of run.json. */
export class RunOwnedByWatcherError extends RunsError {
  override readonly category = 'conflict';

  constructor(readonly runId: string) {
    super(`Run ${runId} is owned by a live watcher; retry when it stops`);
    this.name = 'RunOwnedByWatcherError';
  }
}

/** A run id allocated for a comparison arm already names a run folder; nothing is overwritten. */
export class RunAlreadyExistsError extends RunsError {
  override readonly category = 'conflict';

  constructor(readonly runId: string) {
    super(`Run ${runId} already exists`);
    this.name = 'RunAlreadyExistsError';
  }
}

/**
 * SPEC 0003 section 6: an arm of an A/B comparison is started only through its comparison, which
 * gates the pair's spend; the single-run start refuses it.
 */
export class RunComparisonStartRequiredError extends RunsError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly comparisonId: string,
  ) {
    super(`Run ${runId} is an arm of comparison ${comparisonId}; start the comparison instead`);
    this.name = 'RunComparisonStartRequiredError';
  }
}

/** The run is not an arm of the comparison the caller named. */
export class RunComparisonMismatchError extends RunsError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly comparisonId: string,
  ) {
    super(`Run ${runId} is not an arm of comparison ${comparisonId}`);
    this.name = 'RunComparisonMismatchError';
  }
}

/** More run folders than one rebuild reads; the index is left as it was. */
export class RunIndexTooLargeError extends RunsError {
  override readonly category = 'internal';

  constructor(readonly limit: number) {
    super(`More than ${limit} run folders; the run index rebuild stopped before writing`);
    this.name = 'RunIndexTooLargeError';
  }
}

/** A stored index row no longer satisfies C3; rebuild the index from the run folders. */
export class RunIndexRowCorruptError extends RunsError {
  override readonly category = 'internal';

  constructor(readonly runId: string, options?: ErrorOptions) {
    super(`Run index row ${runId} does not match the run contract; rebuild the index`, options);
    this.name = 'RunIndexRowCorruptError';
  }
}
