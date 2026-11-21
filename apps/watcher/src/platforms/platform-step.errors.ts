import { type PublishAttemptId, type PublishState } from '@studio/shared/platforms';

/** Error taxonomy category (rules/observability.md), as in `daemon.errors.ts`. */
export type PlatformStepErrorCategory = 'conflict';

/**
 * Base of the watcher's platform step errors (SPEC 0007 K7): fields and messages carry ids, states
 * and reason ids only, never a token, a URL, a title, a caption, a tag or an account label.
 */
export abstract class PlatformStepError extends Error {
  abstract readonly category: PlatformStepErrorCategory;
}

/**
 * The watcher was about to write a `state.json` that is not a forward move from the state on disk
 * (`canTransitionPublishState`). Nothing is written, so a terminal attempt is never reopened and a
 * claimed attempt is never sent twice (K5).
 */
export class PublishStateMoveRefusedError extends PlatformStepError {
  override readonly category = 'conflict';

  constructor(
    readonly attemptId: PublishAttemptId,
    readonly from: PublishState,
    readonly to: PublishState,
  ) {
    super(`Publish attempt ${attemptId} cannot move from ${from} to ${to}`);
    this.name = 'PublishStateMoveRefusedError';
  }
}
