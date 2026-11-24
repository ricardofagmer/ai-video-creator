'use client';

import { useFavoriteIds, useOnlyFavorites, type FavoriteScope } from './favorites-store';

/** Whether an item shows under a page's filter: always while it is off, only favorites while it is on. */
export function useFavoriteFilter(scope: FavoriteScope): (id: string) => boolean {
  const ids = useFavoriteIds(scope);
  const only = useOnlyFavorites(scope);
  return (id) => !only || ids.has(id);
}
