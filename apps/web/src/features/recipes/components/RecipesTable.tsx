'use client';

import { StatusBadge, Table, buttonClassName, textLinkClassName, type TableColumn } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import Link from 'next/link';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { FavoriteToggleButton } from '@/features/favorites/components/FavoriteToggleButton';
import { FavoritesEmptyState } from '@/features/favorites/components/FavoritesEmptyState';
import { OnlyFavoritesButton } from '@/features/favorites/components/OnlyFavoritesButton';
import { useFavoriteFilter } from '@/features/favorites/use-favorite-filter';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { enabledStageCount, formatLabel } from '../recipe-labels';

function recipeColumns(texts: WebMessages['recipes']['list']): readonly TableColumn<RecipeVersionView>[] {
  const header = texts.columns;
  return [
    {
      key: 'favorite',
      header: header.favorite,
      render: (view) => <FavoriteToggleButton scope="recipes" id={view.recipe.id} name={view.recipe.name} />,
    },
    {
      key: 'name',
      header: header.name,
      rowHeader: true,
      render: (view) => (
        <Link href={`/receitas/${view.recipe.id}?versao=${view.recipe.version}`} className={textLinkClassName()}>
          {view.recipe.name}
        </Link>
      ),
    },
    { key: 'ref', header: header.ref, render: (view) => <span className="mono">{view.ref}</span> },
    { key: 'format', header: header.format, render: (view) => formatLabel(view) },
    { key: 'stages', header: header.stages, align: 'end', render: (view) => enabledStageCount(view) },
    { key: 'status', header: header.status, render: (view) => <StatusBadge kind="asset" status={view.recipe.status} /> },
    {
      key: 'actions',
      header: header.actions,
      render: (view) => (
        <Link href={`/execucoes/nova?receita=${view.ref}`} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
          {texts.run}
          <span className="visually-hidden"> {view.recipe.name}</span>
        </Link>
      ),
    },
  ];
}

interface RecipesTableProps {
  recipes: readonly RecipeVersionView[];
}

/**
 * design/telas/05: the recipe rows with a favorite star each and the "only favorites" filter. Every row is
 * rendered on the server; the filter applies after hydration, from this browser's storage.
 */
export function RecipesTable({ recipes }: RecipesTableProps): ReactElement {
  const texts = useWebMessages().recipes.list;
  const isShown = useFavoriteFilter('recipes');
  const ids = recipes.map((view) => view.recipe.id);
  const rows = recipes.filter((view) => isShown(view.recipe.id));

  return (
    <div className={layout.stack}>
      <div className={layout.row}>
        <OnlyFavoritesButton scope="recipes" ids={ids} />
      </div>
      <FavoritesEmptyState scope="recipes" ids={ids} />
      {rows.length > 0 && (
        <Table
          caption={texts.title}
          hideCaption
          columns={recipeColumns(texts)}
          rows={rows}
          rowKey={(view) => view.recipe.id}
          emptyText={texts.tableEmpty}
        />
      )}
    </div>
  );
}
