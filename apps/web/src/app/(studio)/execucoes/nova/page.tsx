import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { RecipeRefSchema } from '@studio/shared/recipes';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { NewRunForm } from '@/features/runs/components/NewRunForm';
import { serverStudioClient } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Nova execução' };
export const dynamic = 'force-dynamic';

interface NewRunPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Draft and active versions both run (core `RecipeNotRunnableError` refuses deprecated only). */
async function loadRunnableRecipes(): Promise<RecipeVersionView[]> {
  const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
  return [...page.items].sort(
    (left, right) => left.recipe.name.localeCompare(right.recipe.name, 'pt-BR') || right.recipe.version - left.recipe.version,
  );
}

/** design/telas/07: `/execucoes/nova?receita=<id>@<versão>`. */
export default async function NewRunPage({ searchParams }: NewRunPageProps) {
  const query = await searchParams;
  const recipes = await loadRunnableRecipes();
  const requested = typeof query.receita === 'string' && RecipeRefSchema.safeParse(query.receita).success ? query.receita : null;
  const preselectedRef = recipes.some((view) => view.ref === requested) ? requested : null;

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/execucoes" className={textLinkClassName()}>
            ← Execuções
          </Link>
        }
        title="Nova execução"
      />
      {recipes.length === 0 ? (
        <EmptyState
          title="Nenhuma receita ainda"
          description="Crie uma receita antes de iniciar uma execução."
          action={
            <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
              Nova receita
            </Link>
          }
        />
      ) : (
        <NewRunForm recipes={recipes} preselectedRef={preselectedRef} />
      )}
    </div>
  );
}
