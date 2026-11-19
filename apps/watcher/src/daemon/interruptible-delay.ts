/**
 * Waits `ms`, or less when `signal` aborts; it resolves either way, so a shutdown during the idle
 * poll ends the wait at once instead of after a full interval.
 */
export function interruptibleDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      // Removed on every tick: the loop waits thousands of times on one signal.
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
