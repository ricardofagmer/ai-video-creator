'use client';

import { Button, EmptyState } from '@studio/ui';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { favoritesActions, useFavoriteIds, useOnlyFavorites, type FavoriteScope } from '../favorites-store';

interface FavoritesEmptyStateProps {
  scope: FavoriteScope;
  /** The favorite id of every item of the list; an empty list keeps the page's own empty state instead. */
  ids: readonly string[];
}

/** Shown while a page's filter is on and no item of its list is a favorite, with the way back to the whole list. */
export function FavoritesEmptyState({ scope, ids }: FavoritesEmptyStateProps): ReactElement | null {
  const texts = useWebMessages().favorites;
  const favoriteIds = useFavoriteIds(scope);
  const only = useOnlyFavorites(scope);
  if (!only || ids.length === 0 || ids.some((id) => favoriteIds.has(id))) return null;
  return (
    <EmptyState
      title={texts.emptyTitle}
      description={texts.emptyDescription}
      action={
        <Button type="button" variant="secondary" onClick={() => favoritesActions.setOnly(scope, false)}>
          {texts.showAll}
        </Button>
      }
    />
  );
}
