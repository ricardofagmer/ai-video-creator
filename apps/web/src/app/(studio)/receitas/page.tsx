import { EmptyState, PageHeader, StatusBadge, Table, buttonClassName, textLinkClassName, type TableColumn } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { enabledStageCount, formatLabel, representativeRecipes } from '@/features/recipes/recipe-labels';
import { serverStudioClient } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Receitas' };

const columns: readonly TableColumn<RecipeVersionView>[] = [
  {
    key: 'name',
    header: 'Receita',
    rowHeader: true,
    render: (view) => (
      <Link href={`/receitas/${view.recipe.id}?versao=${view.recipe.version}`} className={textLinkClassName()}>
        {view.recipe.name}
      </Link>
    ),
  },
  { key: 'ref', header: 'Id@versão', render: (view) => <span className="mono">{view.ref}</span> },
  { key: 'format', header: 'Formato', render: (view) => formatLabel(view) },
  { key: 'stages', header: 'Etapas', align: 'end', render: (view) => enabledStageCount(view) },
  { key: 'status', header: 'Status', render: (view) => <StatusBadge kind="asset" status={view.recipe.status} /> },
  {
    key: 'actions',
    header: 'Ações',
    render: (view) => (
      <Link href={`/execucoes/nova?receita=${view.ref}`} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
        Executar<span className="visually-hidden"> {view.recipe.name}</span>
      </Link>
    ),
  },
];

const newRecipeLink = (
  <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
    Nova receita
  </Link>
);

/** design/telas/05: `/receitas`, one row per recipe (its active version, else the newest). */
export default async function RecipesPage() {
  const page = await serverStudioClient().listRecipes({ limit: 100 });
  const recipes = representativeRecipes(page.items);

  return (
    <div className={layout.page}>
      <PageHeader title="Receitas" description="Combinações salvas de ativos e etapas para gerar um vídeo." actions={newRecipeLink} />
      {recipes.length === 0 ? (
        <EmptyState
          title="Nenhuma receita ainda"
          description={
            <>
              Crie uma receita escolhendo ativos do catálogo, ou rode <span className="mono">studio catalog seed</span> para importar as
              duas receitas iniciais.
            </>
          }
          action={newRecipeLink}
        />
      ) : (
        <Table caption="Receitas" hideCaption columns={columns} rows={recipes} rowKey={(view) => view.recipe.id} emptyText="Nenhuma receita ainda." />
      )}
    </div>
  );
}
