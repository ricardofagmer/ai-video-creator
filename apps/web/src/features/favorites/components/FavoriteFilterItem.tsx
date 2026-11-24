'use client';

import { type ReactElement, type ReactNode } from 'react';
import { type FavoriteScope } from '../favorites-store';
import styles from '../favorites.module.css';
import { useFavoriteFilter } from '../use-favorite-filter';

interface FavoriteFilterItemProps {
  scope: FavoriteScope;
  id: string;
  /** Rendered on the server; the filter only hides it after hydration. */
  children: ReactNode;
}

/** One list item that hides itself while its page shows only favorites and it is not one. */
export function FavoriteFilterItem({ scope, id, children }: FavoriteFilterItemProps): ReactElement {
  const shown = useFavoriteFilter(scope)(id);
  return (
    <li className={styles.filterable} hidden={!shown}>
      {children}
    </li>
  );
}
