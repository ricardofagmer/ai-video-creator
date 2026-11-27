'use client';

import { Button, Icon } from '@studio/ui';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { favoritesActions, useFavoriteIds, useOnlyFavorites, type FavoriteScope } from '../favorites-store';

interface OnlyFavoritesButtonProps {
  scope: FavoriteScope;
  /** The favorite id of every item of the open list (the open tab); the number counts favorites among these. */
  ids: readonly string[];
}

/** Switches a page's "only favorites" filter on and off and shows how many favorites the open list has. */
export function OnlyFavoritesButton({ scope, ids }: OnlyFavoritesButtonProps): ReactElement {
  const texts = useWebMessages().favorites;
  const only = useOnlyFavorites(scope);
  const favoriteIds = useFavoriteIds(scope);
  // A set: sorted by score the catalog lists one card per version, and versions share the asset's star.
  const count = new Set(ids.filter((id) => favoriteIds.has(id))).size;

  return (
    <Button
      type="button"
      variant={only ? 'primary' : 'secondary'}
      size="sm"
      aria-pressed={only}
      onClick={() => favoritesActions.setOnly(scope, !only)}
    >
      <Icon name={only ? 'star-filled' : 'star'} size="sm" />
      <span>{texts.onlyWithCount(count)}</span>
    </Button>
  );
}
