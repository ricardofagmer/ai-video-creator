'use client';

import { Button, Icon } from '@studio/ui';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { MAX_FAVORITES, favoritesActions, useFavoriteIds, type FavoriteScope } from '../favorites-store';
import styles from '../favorites.module.css';

interface FavoriteToggleButtonProps {
  scope: FavoriteScope;
  id: string;
  /** The item's name, read out in the button's accessible name. */
  name: string;
  size?: 'sm' | 'md';
}

/** Icon-only star that marks one item of a page's favorite set; `aria-pressed` tells which state it is in. */
export function FavoriteToggleButton({ scope, id, name, size = 'sm' }: FavoriteToggleButtonProps): ReactElement {
  const texts = useWebMessages().favorites;
  const ids = useFavoriteIds(scope);
  const favorite = ids.has(id);
  const full = !favorite && ids.size >= MAX_FAVORITES;
  const label = favorite ? texts.removeHidden(name) : texts.addHidden(name);

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={favorite}
      aria-label={label}
      title={full ? texts.full(MAX_FAVORITES) : label}
      disabled={full}
      onClick={() => favoritesActions.toggle(scope, id)}
    >
      <Icon name={favorite ? 'star-filled' : 'star'} size="sm" className={favorite ? styles.marked : undefined} />
    </Button>
  );
}
