import { type PublishState } from './enums';

/*
 * Publish attempt transitions (SPEC 0007 sections 4.2, 5.4 and 5.5), pure and browser-safe. One rule
 * serves both copies of the state: the watcher's `state.json`, which moves one step at a time, and
 * the api's `publication_attempts` row, which `PublishAttemptSync` may move several steps at once
 * when it last looked before the watcher's intermediate writes. So the rule is "forward only":
 *
 * - a terminal state never changes;
 * - `cancelled` and `expired` only from `queued` (cancel works only before the claim; an
 *   unclaimed request expires after `publishBounds.queueTtlMs`);
 * - an open state moves to a later open state, or to `published`, `failed`, `outcome-unknown` or
 *   `inbox-unconfirmed`.
 *
 * Rewriting the same state (the watcher's `bytesSent` progress) is not a transition.
 */

export type OpenPublishState = Extract<PublishState, 'queued' | 'uploading' | 'processing' | 'sent-to-inbox'>;

/** Open states in the order an attempt moves through them; the rest are terminal. */
export const openPublishStates: readonly OpenPublishState[] = ['queued', 'uploading', 'processing', 'sent-to-inbox'];

const openRank: Readonly<Record<OpenPublishState, number>> = Object.freeze({
  queued: 0,
  uploading: 1,
  processing: 2,
  'sent-to-inbox': 3,
});

export function isOpenPublishState(state: PublishState): state is OpenPublishState {
  return state === 'queued' || state === 'uploading' || state === 'processing' || state === 'sent-to-inbox';
}

/** A refused move; the message names the two states only. */
export class PublishTransitionRefusedError extends Error {
  constructor(
    readonly from: PublishState,
    readonly to: PublishState,
  ) {
    super(`Publish attempt cannot move from ${from} to ${to}`);
    this.name = 'PublishTransitionRefusedError';
  }
}

export function canTransitionPublishState(from: PublishState, to: PublishState): boolean {
  if (!isOpenPublishState(from) || from === to) return false;
  if (to === 'cancelled' || to === 'expired') return from === 'queued';
  if (isOpenPublishState(to)) return openRank[to] > openRank[from];
  return true;
}

/** Throws `PublishTransitionRefusedError` unless `canTransitionPublishState(from, to)`. */
export function assertPublishTransition(from: PublishState, to: PublishState): void {
  if (!canTransitionPublishState(from, to)) throw new PublishTransitionRefusedError(from, to);
}
