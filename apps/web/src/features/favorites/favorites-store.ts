'use client';

import { useSyncExternalStore } from 'react';

/** Each page keeps its own favorite set; the two never share ids or keys. */
export type FavoriteScope = 'catalog' | 'recipes';

/** Keeps the stored list and every filter pass small, far above what one owner marks by hand. */
export const MAX_FAVORITES = 500;
const MAX_ID_LENGTH = 200;

const FAVORITES_KEYS: Readonly<Record<FavoriteScope, string>> = {
  catalog: 'studio.favorites.catalog.v1',
  recipes: 'studio.favorites.recipes.v1',
};
const ONLY_KEYS: Readonly<Record<FavoriteScope, string>> = {
  catalog: 'studio.favorites.only.catalog.v1',
  recipes: 'studio.favorites.only.recipes.v1',
};
const ONLY_ON = '1';
const EMPTY: ReadonlySet<string> = new Set<string>();

// Snapshots are cached per scope so `useSyncExternalStore` sees the same reference until a change.
const idsCache: Record<FavoriteScope, ReadonlySet<string> | null> = { catalog: null, recipes: null };
const onlyCache: Record<FavoriteScope, boolean | null> = { catalog: null, recipes: null };
const listeners: Record<FavoriteScope, Set<() => void>> = { catalog: new Set(), recipes: new Set() };

function isFavoriteId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_ID_LENGTH;
}

function readIds(scope: FavoriteScope): ReadonlySet<string> {
  const cached = idsCache[scope];
  if (cached !== null) return cached;
  let ids: ReadonlySet<string> = EMPTY;
  try {
    // Stored text is untrusted: only short strings survive, de-duplicated and capped.
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FAVORITES_KEYS[scope]) ?? '[]');
    if (Array.isArray(parsed)) ids = new Set(parsed.filter(isFavoriteId).slice(0, MAX_FAVORITES));
  } catch {
    // Blocked or corrupt storage: no favorites instead of a broken page.
  }
  idsCache[scope] = ids;
  return ids;
}

function readOnly(scope: FavoriteScope): boolean {
  const cached = onlyCache[scope];
  if (cached !== null) return cached;
  let only = false;
  try {
    only = window.localStorage.getItem(ONLY_KEYS[scope]) === ONLY_ON;
  } catch {
    // Blocked storage: the filter starts off.
  }
  onlyCache[scope] = only;
  return only;
}

function notify(scope: FavoriteScope): void {
  for (const listener of listeners[scope]) listener();
}

function writeIds(scope: FavoriteScope, ids: ReadonlySet<string>): void {
  idsCache[scope] = ids;
  try {
    window.localStorage.setItem(FAVORITES_KEYS[scope], JSON.stringify([...ids]));
  } catch {
    // Storage full or blocked: the mark still works for this page view.
  }
  notify(scope);
}

function writeOnly(scope: FavoriteScope, only: boolean): void {
  onlyCache[scope] = only;
  try {
    if (only) window.localStorage.setItem(ONLY_KEYS[scope], ONLY_ON);
    else window.localStorage.removeItem(ONLY_KEYS[scope]);
  } catch {
    // Storage blocked: the filter still applies for this page view.
  }
  notify(scope);
}

function subscribeTo(scope: FavoriteScope, listener: () => void): () => void {
  listeners[scope].add(listener);
  // Another tab changed storage; `key` is null when that tab cleared all of it.
  const onStorage = (event: StorageEvent): void => {
    const idsChanged = event.key === null || event.key === FAVORITES_KEYS[scope];
    const onlyChanged = event.key === null || event.key === ONLY_KEYS[scope];
    if (!idsChanged && !onlyChanged) return;
    if (idsChanged) idsCache[scope] = null;
    if (onlyChanged) onlyCache[scope] = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners[scope].delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

// One stable subscribe function per scope, so React does not resubscribe on every render.
const subscribers: Readonly<Record<FavoriteScope, (listener: () => void) => () => void>> = {
  catalog: (listener) => subscribeTo('catalog', listener),
  recipes: (listener) => subscribeTo('recipes', listener),
};

function serverIds(): ReadonlySet<string> {
  return EMPTY;
}

function serverOnly(): boolean {
  return false;
}

/** The favorite ids of one page's set; empty on the server and before hydration. */
export function useFavoriteIds(scope: FavoriteScope): ReadonlySet<string> {
  return useSyncExternalStore(subscribers[scope], () => readIds(scope), serverIds);
}

/** Whether that page's "only favorites" filter is on; false on the server and before hydration. */
export function useOnlyFavorites(scope: FavoriteScope): boolean {
  return useSyncExternalStore(subscribers[scope], () => readOnly(scope), serverOnly);
}

export const favoritesActions = {
  toggle(scope: FavoriteScope, id: string): void {
    if (!isFavoriteId(id)) return;
    const ids = readIds(scope);
    if (ids.has(id)) {
      const next = new Set(ids);
      next.delete(id);
      writeIds(scope, next);
      return;
    }
    if (ids.size >= MAX_FAVORITES) return;
    writeIds(scope, new Set([...ids, id]));
  },
  setOnly(scope: FavoriteScope, only: boolean): void {
    writeOnly(scope, only);
  },
};
