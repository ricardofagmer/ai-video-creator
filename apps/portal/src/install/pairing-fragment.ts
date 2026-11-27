import { PairCodeSchema, type PairCode } from '@studio/shared/api';

/**
 * The shell opens the portal as `<portal>/#pair=<CODE>` (ADR 0010: browsers never send the
 * fragment to a server). A bare `#<CODE>` is accepted too, so either form from ticket 07 works.
 */
export const PAIR_FRAGMENT_KEY = 'pair';

/** Pure: the one-time code in a `location.hash` value, or `undefined` when there is none or it is malformed. */
export function readPairCode(hash: string): PairCode | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (fragment === '') return undefined;
  const candidate = new URLSearchParams(fragment).get(PAIR_FRAGMENT_KEY) ?? fragment;
  const parsed = PairCodeSchema.safeParse(candidate.trim().toUpperCase());
  return parsed.success ? parsed.data : undefined;
}

/** The parts of `window.location` and `window.history` that pairing touches; injected for tests. */
export interface AddressBar {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
  replace(url: string): void;
}

export function browserAddressBar(): AddressBar {
  return {
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
    replace: (url) => window.history.replaceState(null, '', url),
  };
}

/**
 * Reads the code and removes the whole fragment from the address bar at once, before any network
 * call, so it does not linger in history, bookmarks or a screenshot.
 */
export function takePairCode(addressBar: AddressBar): PairCode | undefined {
  if (addressBar.hash === '' || addressBar.hash === '#') return undefined;
  const code = readPairCode(addressBar.hash);
  addressBar.replace(`${addressBar.pathname}${addressBar.search}`);
  return code;
}
