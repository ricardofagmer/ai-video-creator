/*
 * One sample plays at a time on the whole page (guided-creation spec section 2): two voices heard
 * together cannot be compared. Every sample button claims playback before it plays; the previous
 * one is paused. Module state is fine here: it only ever holds media elements of this tab.
 */
let current: HTMLMediaElement | null = null;

/** Pauses whatever sample is playing, unless it is `media` itself. */
export function claimPlayback(media: HTMLMediaElement): void {
  if (current !== null && current !== media && !current.paused) current.pause();
  current = media;
}

/** Forgets `media` when it stops or unmounts, so no stale element is kept. */
export function releasePlayback(media: HTMLMediaElement): void {
  if (current === media) current = null;
}
