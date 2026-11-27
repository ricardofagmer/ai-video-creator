'use client';

import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { useFavoriteFilter } from '../use-favorite-filter';

interface CatalogFavoriteCountProps {
  /** The asset id of every card the caption counts, one entry per card. */
  ids: readonly string[];
  /** Sorted by score each card is a version, so the caption counts versions. */
  byScore: boolean;
  /** Announces changes politely; only the list's top caption does, not each group's. */
  live?: boolean;
}

/** The catalog's card count caption, counting only the cards the favorites filter leaves shown. */
export function CatalogFavoriteCount({ ids, byScore, live = false }: CatalogFavoriteCountProps): ReactElement {
  const texts = useWebMessages().catalog.list;
  const isShown = useFavoriteFilter('catalog');
  const shown = ids.filter(isShown).length;
  return (
    <p className="caption" aria-live={live ? 'polite' : undefined}>
      {byScore ? texts.versionCount(shown) : texts.assetCount(shown)}
    </p>
  );
}
