import { type StartTimer } from '../actions/studio-invoker';
import { type StartInterval } from './shell-controller';

export const startTimer: StartTimer = (delayMs: number, callback: () => void): (() => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

export const startInterval: StartInterval = (periodMs: number, callback: () => void): (() => void) => {
  const handle = setInterval(callback, periodMs);
  return () => clearInterval(handle);
};
