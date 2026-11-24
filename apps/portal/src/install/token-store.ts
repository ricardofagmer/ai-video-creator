import { InstallTokenSchema, type InstallToken } from '@studio/shared/api';

/**
 * The portal token lives in `localStorage`, which the browser scopes to this origin only. It is
 * sent nowhere but `http://127.0.0.1` (DI-AC-21). Storage can be missing or throw (private
 * windows, blocked storage, quota): every access is guarded and a failure means "not paired".
 */
export const TOKEN_STORAGE_KEY = 'engineos-video-creator.portal-token';

/** The part of `Storage` the store uses; injected for tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TokenStore {
  read(): InstallToken | undefined;
  /** Returns false when the browser refused to store it; the session then stays paired in memory only. */
  write(token: InstallToken): boolean;
  forget(): void;
}

export function createTokenStore(storage: KeyValueStorage | undefined): TokenStore {
  return {
    read: () => {
      if (storage === undefined) return undefined;
      try {
        const parsed = InstallTokenSchema.safeParse(storage.getItem(TOKEN_STORAGE_KEY));
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },
    write: (token) => {
      if (storage === undefined) return false;
      try {
        storage.setItem(TOKEN_STORAGE_KEY, token);
        return true;
      } catch {
        return false;
      }
    },
    forget: () => {
      if (storage === undefined) return;
      try {
        storage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Nothing to recover: an unreadable storage already reads as "no token".
        return;
      }
    },
  };
}

/** `window.localStorage`, or `undefined` where reading the property itself throws. */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
