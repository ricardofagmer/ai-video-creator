'use client';

import { StatusBadge, buttonClassName } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import Link from 'next/link';
import { type ReactElement } from 'react';
import { PosterCard } from '@/features/common/components/PosterCard';
import layout from '@/features/common/layout.module.css';
import poster from '@/features/common/poster-card.module.css';
import { studioToneOf } from '@/features/common/studio-artwork';
import { FavoriteToggleButton } from '@/features/favorites/components/FavoriteToggleButton';
import { FavoritesEmptyState } from '@/features/favorites/components/FavoritesEmptyState';
import { OnlyFavoritesButton } from '@/features/favorites/components/OnlyFavoritesButton';
import { useFavoriteFilter } from '@/features/favorites/use-favorite-filter';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { enabledStageCount, formatLabel } from '../recipe-labels';

/** One poster card per recipe: the whole card opens the version; Run and the favorite star sit in the footer. */
function RecipeCard({ view, texts }: { view: RecipeVersionView; texts: WebMessages['recipes']['list'] }): ReactElement {
  const { recipe } = view;
  return (
    <PosterCard artwork={{ glyph: 'script', tone: studioToneOf(recipe.id) }}>
      <h3 className={`heading-3 ${poster.name}`}>
        <Link href={`/receitas/${recipe.id}?versao=${recipe.version}`} className={poster.cardLink}>
          {recipe.name}
        </Link>
      </h3>
      <p className={poster.meta}>
        <StatusBadge kind="asset" status={recipe.status} />
        <span className="caption mono">{view.ref}</span>
      </p>
      <p className={poster.excerpt}>
        {texts.columns.format}: {formatLabel(view)} · {texts.columns.stages}: {enabledStageCount(view)}
      </p>
      <div className={poster.links}>
        <Link href={`/execucoes/nova?receita=${view.ref}`} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
          {texts.run}
          <span className="visually-hidden"> {recipe.name}</span>
        </Link>
        <FavoriteToggleButton scope="recipes" id={recipe.id} name={recipe.name} />
      </div>
    </PosterCard>
  );
}

interface RecipeListProps {
  recipes: readonly RecipeVersionView[];
}

/**
 * design/telas/05: the recipe cards with a favorite star each and the "only favorites" filter. Every card is
 * rendered on the server; the filter applies after hydration, from this browser's storage.
 */
export function RecipeList({ recipes }: RecipeListProps): ReactElement {
  const texts = useWebMessages().recipes.list;
  const isShown = useFavoriteFilter('recipes');
  const ids = recipes.map((view) => view.recipe.id);
  const shown = recipes.filter((view) => isShown(view.recipe.id));

  return (
    <div className={layout.stack}>
      <div className={layout.row}>
        <OnlyFavoritesButton scope="recipes" ids={ids} />
      </div>
      <FavoritesEmptyState scope="recipes" ids={ids} />
      {shown.length > 0 && (
        <ul className={layout.cardGrid}>
          {shown.map((view) => (
            <li key={view.recipe.id}>
              <RecipeCard view={view} texts={texts} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
