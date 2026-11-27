'use client';

import { classNames } from '@studio/ui';
import { type ReactElement, type ReactNode } from 'react';
import { type FavoriteScope } from '../favorites-store';
import styles from '../favorites.module.css';
import { useFavoriteFilter } from '../use-favorite-filter';

interface FavoriteFilterSectionProps {
  scope: FavoriteScope;
  /** The favorite id of every item in the section. */
  ids: readonly string[];
  /** Id of the section heading, for `aria-labelledby`. */
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

/** A group section that hides itself while its page shows only favorites and none of its items is one. */
export function FavoriteFilterSection({ scope, ids, labelledBy, className, children }: FavoriteFilterSectionProps): ReactElement {
  const isShown = useFavoriteFilter(scope);
  const anyShown = ids.some(isShown);
  return (
    <section aria-labelledby={labelledBy} className={classNames(styles.filterable, className)} hidden={!anyShown}>
      {children}
    </section>
  );
}
