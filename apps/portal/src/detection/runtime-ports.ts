/** Time source and timer, injected so tests fix instants and fire timers by hand. */
export interface Clock {
  now(): number;
  /** Runs `callback` once after `delayMs`; the returned function cancels it. */
  schedule(callback: () => void, delayMs: number): () => void;
}

/** Whether the tab is visible, and a way to hear when that changes. */
export interface VisibilitySource {
  isVisible(): boolean;
  /** Returns the function that stops listening. */
  onChange(listener: () => void): () => void;
}

export const browserClock: Clock = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => {
    const handle = window.setTimeout(callback, delayMs);
    return () => window.clearTimeout(handle);
  },
};

export function browserVisibility(): VisibilitySource {
  return {
    isVisible: () => document.visibilityState === 'visible',
    onChange: (listener) => {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}
