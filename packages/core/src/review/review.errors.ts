import { type AssetRef } from '@studio/shared/catalog';
import { type RunStatus } from '@studio/shared/run-format';
import { type InputIssue } from '../catalog';

/** Error taxonomy category (rules/observability.md); the api filter maps it to a status code. */
export type ReviewErrorCategory = 'validation' | 'not_found' | 'conflict' | 'internal';

/**
 * Base of every review and outcomes domain error (R1-17). Messages carry run ids, gate ids,
 * statuses and checklist item ids only: never notes, reviewer names or file contents.
 */
export abstract class ReviewError extends Error {
  abstract readonly category: ReviewErrorCategory;
}

export class InvalidReviewInputError extends ReviewError {
  override readonly category = 'validation';

  constructor(readonly issues: readonly InputIssue[]) {
    super(`Invalid review input: ${issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidReviewInputError';
  }
}

export class ReviewRunNotFoundError extends ReviewError {
  override readonly category = 'not_found';

  constructor(readonly runId: string) {
    super(`Run not found: ${runId}`);
    this.name = 'ReviewRunNotFoundError';
  }
}

/** run.json or approval.json names another run than its folder; the folder is not trusted. */
export class ReviewRunMismatchError extends ReviewError {
  override readonly category = 'internal';

  constructor(
    readonly folderRunId: string,
    readonly fileRunId: string,
    readonly file: 'run.json' | 'approval.json',
  ) {
    super(`Run folder ${folderRunId} holds ${file} of run ${fileRunId}`);
    this.name = 'ReviewRunMismatchError';
  }
}

/**
 * Why a review write is refused (ADR 0003 "Who writes what", SPEC 0002 A6):
 * - `live-watcher`: a watcher pid is alive, so the watcher is the sole writer of the run;
 * - `status`: the run is not in a status this action applies to;
 * - `gate-not-awaited`: the run is not waiting on the gate the decision answers;
 * - `already-decided`: the final review was already recorded with another decision.
 */
export type ReviewRefusalReason = 'live-watcher' | 'status' | 'gate-not-awaited' | 'already-decided';

export class ReviewNotAllowedError extends ReviewError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly status: RunStatus,
    readonly reason: ReviewRefusalReason,
  ) {
    super(`Run ${runId} (${status}) refuses this review action: ${reason}`);
    this.name = 'ReviewNotAllowedError';
  }
}

/** D14: an approval with a required checklist item left unchecked is refused (R1-17). */
export class RequiredChecklistUncheckedError extends ReviewError {
  override readonly category = 'validation';

  constructor(
    readonly runId: string,
    readonly itemIds: readonly string[],
  ) {
    super(`Run ${runId} cannot be approved; required checklist items are unchecked: ${itemIds.join(', ')}`);
    this.name = 'RequiredChecklistUncheckedError';
  }
}

/** C3 caps approval.json at 100 decisions; a run answered that often needs a person, not a write. */
export class ApprovalFileFullError extends ReviewError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly limit: number,
  ) {
    super(`approval.json of run ${runId} already holds ${limit} decisions`);
    this.name = 'ApprovalFileFullError';
  }
}

/** The artifact to promote is not a hashed output in run.json or manifest.json. */
export class ArtifactNotRecordedError extends ReviewError {
  override readonly category = 'validation';

  constructor(
    readonly runId: string,
    readonly artifactPath: string,
  ) {
    super(`Run ${runId} recorded no output at ${artifactPath}`);
    this.name = 'ArtifactNotRecordedError';
  }
}

/**
 * The artifact on disk no longer matches the hash the run recorded, or resolves outside the run
 * folder through a link. `savedRef` names a draft version saved before the change was seen.
 */
export class ArtifactChangedError extends ReviewError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly artifactPath: string,
    readonly savedRef: string | null,
  ) {
    super(
      `Output ${artifactPath} of run ${runId} differs from its recorded hash` +
        (savedRef === null ? '' : `; draft ${savedRef} was saved and should be deprecated`),
    );
    this.name = 'ArtifactChangedError';
  }
}

export class UnsafeArtifactPathError extends ReviewError {
  override readonly category = 'validation';

  constructor(
    readonly runId: string,
    readonly artifactPath: string,
  ) {
    super(`Output ${artifactPath} of run ${runId} resolves outside the run folder`);
    this.name = 'UnsafeArtifactPathError';
  }
}

/** The output's file type has no catalog MIME type; the catalog allowlist decides per kind. */
export class ArtifactTypeNotSupportedError extends ReviewError {
  override readonly category = 'validation';

  constructor(readonly artifactPath: string) {
    super(`Output ${artifactPath} has a file type the catalog does not accept`);
    this.name = 'ArtifactTypeNotSupportedError';
  }
}

/**
 * Why a promotion is refused for biometric material (ADR 0003 decision 2, PRD 7.3, criterion 22):
 * - `target-asset`: the receiving asset is biometric; the owner registers those by reference only;
 * - `run-used-biometric`: the run bound or referenced a biometric version, so every output may
 *   carry it (narration and `final.mp4` carry the cloned voice) and none is reused.
 */
export type BiometricRefusalReason =
  | { kind: 'target-asset'; assetId: string }
  | { kind: 'run-used-biometric'; runId: string; ref: AssetRef };

function biometricRefusalMessage(reason: BiometricRefusalReason): string {
  return reason.kind === 'target-asset'
    ? `Asset ${reason.assetId} is biometric; a run output is never promoted into it`
    : `Run ${reason.runId} used biometric asset version ${reason.ref}; none of its outputs is promoted`;
}

/** Messages name asset ids, refs and run ids only, never a reference path. */
export class PromoteBiometricRefusedError extends ReviewError {
  override readonly category = 'conflict';

  constructor(readonly reason: BiometricRefusalReason) {
    super(biometricRefusalMessage(reason));
    this.name = 'PromoteBiometricRefusedError';
  }
}

/**
 * The run folder's manifest names another run, so the versions it pinned cannot be trusted to be
 * this run's; the biometric check fails closed instead of skipping the manifest.
 */
export class PromoteManifestMismatchError extends ReviewError {
  override readonly category = 'conflict';

  constructor(readonly runId: string) {
    super(`Run ${runId} has a manifest that names another run; promotion refused`);
    this.name = 'PromoteManifestMismatchError';
  }
}

/**
 * A version the run used cannot be resolved in the catalog, so its sensitivity is unknown and the
 * promotion fails closed rather than risk reusing biometric material.
 */
export class PromoteSensitivityUnknownError extends ReviewError {
  override readonly category = 'conflict';

  constructor(
    readonly runId: string,
    readonly ref: AssetRef,
  ) {
    super(`Run ${runId} used ${ref}, whose sensitivity cannot be resolved; promotion refused`);
    this.name = 'PromoteSensitivityUnknownError';
  }
}
