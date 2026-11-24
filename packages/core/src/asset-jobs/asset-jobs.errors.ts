import { type AssetJobKind } from '@studio/shared/asset-jobs';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type AssetJobErrorCategory = 'validation' | 'not_found' | 'conflict' | 'dependency' | 'internal';

/**
 * The `ApiError.reason` of an asset job refusal. All but the last two are frozen in
 * `apiGuidedCreationErrorReasons` (`@studio/shared/api`); input validation keeps the generic
 * invalid-input shape the other modules use, and a corrupt `job.json` is an internal error
 * like `curation-file-corrupt`.
 */
export type AssetJobErrorReason =
  | 'asset-job-not-a-voice'
  | 'asset-job-not-a-video-reference'
  | 'asset-job-link-only'
  | 'asset-job-biometric-refused'
  | 'asset-job-queue-full'
  | 'asset-job-sample-not-ready'
  | 'invalid-asset-job-input'
  | 'asset-job-file-corrupt';

/**
 * Base of every asset job domain error. Each class is named so the api's `reasonOf(name)` yields
 * the same string as `reason`. Messages carry refs, kinds and counts only: never a file path (a
 * voice sample is derived biometric material), a sentence or a model's text.
 */
export abstract class AssetJobError extends Error {
  abstract readonly category: AssetJobErrorCategory;
  abstract readonly reason: AssetJobErrorReason;
}

export class InvalidAssetJobInputError extends AssetJobError {
  override readonly category = 'validation';
  override readonly reason = 'invalid-asset-job-input';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid asset job input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidAssetJobInputError';
  }
}

/** 422: the version is not an `ai-model` voice (voice clone, ElevenLabs or local voice). */
export class AssetJobNotAVoiceError extends AssetJobError {
  override readonly category = 'validation';
  override readonly reason = 'asset-job-not-a-voice';

  constructor(readonly ref: string) {
    super(`Asset version is not a voice: ${ref}`);
    this.name = 'AssetJobNotAVoiceError';
  }
}

/** 422: the version is not a stored video reference. */
export class AssetJobNotAVideoReferenceError extends AssetJobError {
  override readonly category = 'validation';
  override readonly reason = 'asset-job-not-a-video-reference';

  constructor(readonly ref: string) {
    super(`Asset version is not a video reference: ${ref}`);
    this.name = 'AssetJobNotAVideoReferenceError';
  }
}

/** 422: the reference is a saved link (text), with no video bytes to look at. */
export class AssetJobLinkOnlyError extends AssetJobError {
  override readonly category = 'validation';
  override readonly reason = 'asset-job-link-only';

  constructor(readonly ref: string) {
    super(`Asset version is a link only: ${ref}`);
    this.name = 'AssetJobLinkOnlyError';
  }
}

/** 422: biometric material never leaves the machine for an analysis. */
export class AssetJobBiometricRefusedError extends AssetJobError {
  override readonly category = 'validation';
  override readonly reason = 'asset-job-biometric-refused';

  constructor(readonly ref: string) {
    super(`Asset version is biometric and cannot be analysed: ${ref}`);
    this.name = 'AssetJobBiometricRefusedError';
  }
}

/** 409: `ASSET_JOB_QUEUE_MAX` jobs of this kind already wait for the watcher. */
export class AssetJobQueueFullError extends AssetJobError {
  override readonly category = 'conflict';
  override readonly reason = 'asset-job-queue-full';

  constructor(
    readonly kind: AssetJobKind,
    readonly queued: number,
  ) {
    super(`Asset job queue is full: ${queued} ${kind} jobs requested`);
    this.name = 'AssetJobQueueFullError';
  }
}

/** 404: no `done` voice sample with a readable clip for this version. */
export class AssetJobSampleNotReadyError extends AssetJobError {
  override readonly category = 'not_found';
  override readonly reason = 'asset-job-sample-not-ready';

  constructor(readonly ref: string) {
    super(`Voice sample is not ready: ${ref}`);
    this.name = 'AssetJobSampleNotReadyError';
  }
}

/** 500: `job.json` exists but does not match its contract; nothing is written over it. */
export class AssetJobFileCorruptError extends AssetJobError {
  override readonly category = 'internal';
  override readonly reason = 'asset-job-file-corrupt';

  constructor(
    readonly kind: AssetJobKind,
    readonly ref: string,
  ) {
    super(`Asset job ${kind} ${ref}: job.json does not match its contract`);
    this.name = 'AssetJobFileCorruptError';
  }
}
